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

const asignarCamionSchema = z.object({
  pedido_ids: z.array(z.number().int().positive()).min(1),
  camion_asignado: z.string().min(2, "Indicá el camión o chofer"),
});

const cerrarRendicionSchema = z.object({
  camion_asignado: z.string().min(1),
  fecha_reparto: z.string().optional(),
  efectivo_rendido: z.number().min(0),
  transferencia_rendida: z.number().min(0),
  cheques_rendidos: z.number().min(0),
  observaciones: z.string().max(255).optional().nullable(),
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
              p.camion_asignado,
              p.created_at,
              p.cliente_comercio_id,
              COALESCE(c.nombre_fantasia, p.guest_nombre, 'Cliente Mostrador') AS comercio_nombre,
              COALESCE(c.direccion, p.guest_direccion, 'Sin dirección') AS direccion,
              COALESCE(c.telefono, p.guest_telefono, '') AS telefono,
              COALESCE(NULLIF(TRIM(c.zona_reparto), ''), 'General') AS zona_reparto,
              COALESCE(c.current_balance, 0) AS saldo_cuenta_corriente
       FROM pedidos p
       LEFT JOIN clientes_comercios c ON p.cliente_comercio_id = c.id
       WHERE p.distribuidora_id = ?
         AND p.deleted_at IS NULL
         AND p.estado IN ('CONFIRMADO', 'DESPACHADO', 'PREPARADO', 'EN_REPARTO')
         ${filtroFecha}
       ORDER BY p.id DESC`,
      params,
    );

    const zonasMap = new Map();

    for (const row of rows) {
      const camionLabel = row.camion_asignado
        ? ` [${row.camion_asignado}]`
        : "";
      const claveGrupo = `${row.zona_reparto || "General"}${camionLabel}`;

      if (!zonasMap.has(claveGrupo)) {
        zonasMap.set(claveGrupo, {
          zona: claveGrupo,
          zona_base: row.zona_reparto || "General",
          camion_asignado: row.camion_asignado || "Sin camión asignado",
          cantidad_paradas: 0,
          total_reparto_zona: 0,
          paradas: [],
        });
      }

      const parada = {
        ...row,
        total: Number(row.total || 0),
        saldo_cuenta_corriente: Number(row.saldo_cuenta_corriente || 0),
      };

      const grupo = zonasMap.get(claveGrupo);
      grupo.cantidad_paradas += 1;
      grupo.total_reparto_zona += parada.total;
      grupo.paradas.push(parada);
    }

    return Array.from(zonasMap.values()).sort((a, b) =>
      a.zona.localeCompare(b.zona),
    );
  }

  async asignarCamionLote(distribuidoraId, payload) {
    const data = asignarCamionSchema.parse(payload);
    await pool.query(
      `UPDATE pedidos
       SET camion_asignado = ?
       WHERE distribuidora_id = ? AND id IN (?) AND deleted_at IS NULL`,
      [data.camion_asignado.trim(), distribuidoraId, data.pedido_ids],
    );
    return {
      actualizados: data.pedido_ids.length,
      camion_asignado: data.camion_asignado.trim(),
    };
  }

  async registrarCobroEnCalle(distribuidoraId, usuarioId, payload) {
    const data = registrarCobroSchema.parse(payload);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [cliRows] = await connection.query(
        `SELECT id, nombre_fantasia, current_balance
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
      const nuevoSaldo = Number(comercio.current_balance) - data.monto;

      await connection.query(
        `UPDATE clientes_comercios SET current_balance = ? WHERE id = ?`,
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
        saldo_anterior: Number(comercio.current_balance),
        nuevo_saldo: nuevoSaldo,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async cerrarRendicionReparto(distribuidoraId, usuarioId, payload) {
    const data = cerrarRendicionSchema.parse(payload);
    const fecha = data.fecha_reparto || new Date().toISOString().slice(0, 10);

    // Calcular total esperado de pedidos entregados contra entrega o cobrados hoy para ese camión
    const [[esperadoRow]] = await pool.query(
      `SELECT COALESCE(SUM(total), 0) AS total_contado
       FROM pedidos
       WHERE distribuidora_id = ?
         AND deleted_at IS NULL
         AND estado = 'ENTREGADO'
         AND condicion_pago IN ('CONTADO_ENTREGA', 'TRANSFERENCIA')
         AND COALESCE(camion_asignado, 'Sin camión asignado') = ?
         AND DATE(updated_at) = ?`,
      [distribuidoraId, data.camion_asignado, fecha],
    );

    const totalEsperado = Number(esperadoRow.total_contado || 0);
    const totalRendido =
      data.efectivo_rendido +
      data.transferencia_rendida +
      data.cheques_rendidos;
    const diferenciaCaja = Number((totalRendido - totalEsperado).toFixed(2));

    const [insertRes] = await pool.query(
      `INSERT INTO reparto_rendiciones
       (distribuidora_id, usuario_id, camion_asignado, fecha_reparto, total_esperado,
        efectivo_rendido, transferencia_rendida, cheques_rendidos, diferencia_caja, observaciones)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        distribuidoraId,
        usuarioId,
        data.camion_asignado,
        fecha,
        totalEsperado,
        data.efectivo_rendido,
        data.transferencia_rendida,
        data.cheques_rendidos,
        diferenciaCaja,
        data.observaciones || null,
      ],
    );

    return {
      rendicion_id: insertRes.insertId,
      camion_asignado: data.camion_asignado,
      fecha_reparto: fecha,
      total_esperado: totalEsperado,
      total_rendido: totalRendido,
      diferencia_caja: diferenciaCaja,
    };
  }
}

module.exports = new RepartoService();
