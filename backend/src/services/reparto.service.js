const { z } = require("zod");
const pool = require("../config/db");

const registrarCobroSchema = z.object({
  cliente_comercio_id: z.number().int().positive(),
  pedido_id: z.number().int().positive().optional().nullable(),
  monto: z.number().positive("El monto cobrado debe ser mayor a 0"),
  metodo_pago: z
    .enum(["EFECTIVO", "TRANSFERENCIA", "CHEQUE"])
    .default("EFECTIVO"),
  notas: z.string().max(150).optional().nullable(),
});

class RepartoService {
  async obtenerHojaDeRuta(distribuidoraId, fecha = null) {
    const filtroFecha = fecha ? "AND DATE(p.created_at) = ?" : "";
    const params = fecha ? [distribuidoraId, fecha] : [distribuidoraId];

    const [rows] = await pool.query(
      `SELECT p.id AS pedido_id,
              p.numero_pedido,
              p.estado,
              p.condicion_pago,
              p.total,
              p.notas,
              p.created_at,
              c.id AS cliente_comercio_id,
              COALESCE(c.nombre_fantasia, p.guest_nombre) AS comercio_nombre,
              COALESCE(c.direccion, p.guest_direccion) AS direccion,
              COALESCE(c.telefono, p.guest_telefono) AS telefono,
              COALESCE(NULLIF(TRIM(c.zona_reparto), ''), 'Sin Zona Asignada') AS zona_reparto,
              COALESCE(c.saldo_actual, 0) AS saldo_cuenta_corriente
       FROM pedidos p
       LEFT JOIN clientes_comercios c ON p.cliente_comercio_id = c.id
       WHERE p.distribuidora_id = ?
         AND p.deleted_at IS NULL
         AND p.estado IN ('CONFIRMADO', 'PREPARADO', 'EN_REPARTO')
         ${filtroFecha}
       ORDER BY zona_reparto ASC, comercio_nombre ASC, p.id ASC`,
      params,
    );

    // Agrupar por zona_reparto para la vista móvil del chofer/preventista
    const zonasMap = new Map();
    for (const row of rows) {
      if (!zonasMap.has(row.zona_reparto)) {
        zonasMap.set(row.zona_reparto, {
          zona: row.zona_reparto,
          cantidad_paradas: 0,
          total_reparto_zona: 0,
          paradas: [],
        });
      }
      const grupo = zonasMap.get(row.zona_reparto);
      grupo.cantidad_paradas += 1;
      grupo.total_reparto_zona += Number(row.total);
      grupo.paradas.push(row);
    }

    return Array.from(zonasMap.values());
  }

  async registrarCobroEnCalle(distribuidoraId, usuarioId, payload) {
    const data = registrarCobroSchema.parse(payload);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // 1. Bloquear ficha del comercio
      const [cliRows] = await connection.query(
        `SELECT id, nombre_fantasia, saldo_actual
         FROM clientes_comercios
         WHERE id = ? AND distribuidora_id = ? AND deleted_at IS NULL
         FOR UPDATE`,
        [data.cliente_comercio_id, distribuidoraId],
      );

      if (cliRows.length === 0) {
        const err = new Error("Comercio cliente no encontrado");
        err.statusCode = 404;
        throw err;
      }

      const comercio = cliRows[0];
      const nuevoSaldo = Number(comercio.saldo_actual) - data.monto;

      // 2. Descontar saldo de cuenta corriente
      await connection.query(
        `UPDATE clientes_comercios SET saldo_actual = ? WHERE id = ?`,
        [nuevoSaldo, comercio.id],
      );

      // 3. Registrar asiento en cuenta_corriente_movimientos
      const concepto = `Cobro en calle (${data.metodo_pago})${data.notas ? ` - ${data.notas}` : ""}`;
      await connection.query(
        `INSERT INTO cuenta_corriente_movimientos
         (distribuidora_id, cliente_comercio_id, pedido_id, tipo, monto, saldo_resultante, concepto, registrado_por)
         VALUES (?, ?, ?, 'PAGO_RECIBIDO', ?, ?, ?, ?)`,
        [
          distribuidoraId,
          comercio.id,
          data.pedido_id || null,
          data.monto,
          nuevoSaldo,
          concepto,
          usuarioId,
        ],
      );

      await connection.commit();

      return {
        comercio_id: comercio.id,
        comercio_nombre: comercio.nombre_fantasia,
        monto_cobrado: data.monto,
        saldo_anterior: Number(comercio.saldo_actual),
        nuevo_saldo: nuevoSaldo,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = new RepartoService();
