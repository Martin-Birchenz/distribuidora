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
      `SELECT p.*,
              c.nombre_fantasia AS cli_nombre,
              c.direccion AS cli_direccion,
              c.telefono AS cli_telefono,
              c.saldo_actual AS cli_saldo,
              c.zona AS cli_zona
       FROM pedidos p
       LEFT JOIN clientes_comercios c ON p.cliente_comercio_id = c.id
       WHERE p.distribuidora_id = ?
         AND p.deleted_at IS NULL
         AND p.estado IN ('CONFIRMADO', 'PREPARADO', 'EN_REPARTO')
         ${filtroFecha}
       ORDER BY p.id DESC`,
      params,
    );

    const zonasMap = new Map();

    for (const row of rows) {
      const zona =
        (row.cli_zona || row.zona_reparto || "General").trim() || "General";

      if (!zonasMap.has(zona)) {
        zonasMap.set(zona, {
          zona,
          cantidad_paradas: 0,
          total_reparto_zona: 0,
          paradas: [],
        });
      }

      const parada = {
        pedido_id: row.id,
        numero_pedido: row.numero_pedido,
        estado: row.estado,
        condicion_pago: row.condicion_pago,
        total: Number(row.total || 0),
        notas: row.notas,
        created_at: row.created_at,
        cliente_comercio_id: row.cliente_comercio_id,
        comercio_nombre:
          row.cli_nombre ||
          row.guest_nombre ||
          row.cliente_nombre ||
          "Cliente Mostrador",
        direccion:
          row.cli_direccion ||
          row.guest_direccion ||
          row.direccion_entrega ||
          "Sin dirección",
        telefono: row.cli_telefono || row.guest_telefono || "",
        zona_reparto: zona,
        saldo_cuenta_corriente: Number(row.cli_saldo || 0),
      };

      const grupo = zonasMap.get(zona);
      grupo.cantidad_paradas += 1;
      grupo.total_reparto_zona += parada.total;
      grupo.paradas.push(parada);
    }

    return Array.from(zonasMap.values()).sort((a, b) =>
      a.zona.localeCompare(b.zona),
    );
  }

  async registrarCobroEnCalle(distribuidoraId, usuarioId, payload) {
    const data = registrarCobroSchema.parse(payload);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

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

      await connection.query(
        `UPDATE clientes_comercios SET saldo_actual = ? WHERE id = ?`,
        [nuevoSaldo, comercio.id],
      );

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
