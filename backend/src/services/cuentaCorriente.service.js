const pool = require("../config/db");

class CuentaCorrienteService {
  async obtenerMovimientosCliente(distribuidoraId, clienteComercioId) {
    const [clienteRows] = await pool.query(
      `SELECT id, nombre_fantasia, razon_social, cuit, telefono, direccion,
              zona_reparto, credit_limit, current_balance
       FROM clientes_comercios
       WHERE id = ? AND distribuidora_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [clienteComercioId, distribuidoraId],
    );

    if (clienteRows.length === 0) {
      const err = new Error("Comercio cliente no encontrado");
      err.statusCode = 404;
      throw err;
    }

    const [movimientos] = await pool.query(
      `SELECT m.id, m.tipo, m.metodo_pago, m.monto, m.saldo_anterior, m.saldo_posterior,
              m.referencia_comprobante, m.observaciones, m.created_at,
              p.numero_pedido, u.full_name AS registrado_por
       FROM cuenta_corriente_movimientos m
       LEFT JOIN pedidos p ON m.pedido_id = p.id
       LEFT JOIN users u ON m.registrado_por_user_id = u.id
       WHERE m.distribuidora_id = ? AND m.cliente_comercio_id = ?
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 100`,
      [distribuidoraId, clienteComercioId],
    );

    return {
      cliente: clienteRows[0],
      movimientos,
    };
  }

  async registrarCobranza(distribuidoraId, userId, payload) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [cliRows] = await connection.query(
        `SELECT id, nombre_fantasia, current_balance
         FROM clientes_comercios
         WHERE id = ? AND distribuidora_id = ? AND deleted_at IS NULL
         FOR UPDATE`,
        [payload.cliente_comercio_id, distribuidoraId],
      );

      if (cliRows.length === 0) {
        const err = new Error("Comercio cliente no encontrado");
        err.statusCode = 404;
        throw err;
      }

      const cliente = cliRows[0];
      const saldoAnterior = Number(cliente.current_balance);
      const montoPago = Number(payload.monto);
      const saldoPosterior = Number((saldoAnterior - montoPago).toFixed(2));

      await connection.query(
        `UPDATE clientes_comercios SET current_balance = ? WHERE id = ? AND distribuidora_id = ?`,
        [saldoPosterior, cliente.id, distribuidoraId],
      );

      const [movRes] = await connection.query(
        `INSERT INTO cuenta_corriente_movimientos (
          distribuidora_id, cliente_comercio_id, pedido_id, registrado_por_user_id,
          tipo, metodo_pago, monto, saldo_anterior, saldo_posterior,
          referencia_comprobante, observaciones
        ) VALUES (?, ?, ?, ?, 'CREDITO_PAGO', ?, ?, ?, ?, ?, ?)`,
        [
          distribuidoraId,
          cliente.id,
          payload.pedido_id || null,
          userId,
          payload.metodo_pago,
          montoPago,
          saldoAnterior,
          saldoPosterior,
          payload.referencia_comprobante || null,
          payload.observaciones || `Cobranza ${payload.metodo_pago}`,
        ],
      );

      await connection.commit();

      return {
        recibo_id: movRes.insertId,
        comercio: cliente.nombre_fantasia,
        monto_abonado: montoPago,
        saldo_anterior: saldoAnterior,
        saldo_actual: saldoPosterior,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async resumenSaldosDeudores(distribuidoraId) {
    const [rows] = await pool.query(
      `SELECT c.id, c.nombre_fantasia, c.zona_reparto, c.telefono, c.credit_limit, c.current_balance,
            COALESCE((
              SELECT SUM(p.total)
              FROM pedidos p
              WHERE p.cliente_comercio_id = c.id
                AND p.distribuidora_id = c.distribuidora_id
                AND p.estado = 'PENDIENTE_APROBACION'
                AND p.deleted_at IS NULL
            ), 0) AS pendiente_aprobacion
     FROM clientes_comercios c
     WHERE c.distribuidora_id = ? AND c.deleted_at IS NULL
     ORDER BY (c.current_balance + pendiente_aprobacion) DESC, c.nombre_fantasia ASC`,
      [distribuidoraId],
    );

    const totalCalle = rows.reduce(
      (acc, r) => acc + Number(r.current_balance),
      0,
    );
    const comerciosConDeuda = rows.filter(
      (r) => Number(r.current_balance) > 0,
    ).length;

    return {
      total_a_cobrar: Number(totalCalle.toFixed(2)),
      comercios_con_saldo: comerciosConDeuda,
      detalle: rows,
    };
  }
}

module.exports = new CuentaCorrienteService();
