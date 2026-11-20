const { z } = require("zod");
const pool = require("../config/db");

const registrarDevolucionSchema = z.object({
  motivo: z.string().min(3, "Indicá el motivo de la devolución"),
  items: z
    .array(
      z.object({
        producto_id: z.number().int().positive(),
        cantidad_devuelta: z.number().int().positive(),
      }),
    )
    .min(1, "Seleccioná al menos un producto para devolver"),
});

class DevolucionService {
  async procesarDevolucion(distribuidoraId, pedidoId, usuarioId, payload) {
    const data = registrarDevolucionSchema.parse(payload);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // 1. Bloquear el pedido y verificar estado válido
      const [pedRows] = await connection.query(
        `SELECT id, numero_pedido, cliente_comercio_id, condicion_pago, estado, total
         FROM pedidos
         WHERE id = ? AND distribuidora_id = ? AND deleted_at IS NULL
         FOR UPDATE`,
        [pedidoId, distribuidoraId],
      );

      if (pedRows.length === 0) {
        const err = new Error("Pedido no encontrado");
        err.statusCode = 404;
        throw err;
      }

      const pedido = pedRows[0];
      if (["CANCELADO", "PENDIENTE_APROBACION"].includes(pedido.estado)) {
        const err = new Error(
          `No se puede registrar devolución en un pedido con estado ${pedido.estado}`,
        );
        err.statusCode = 400;
        throw err;
      }

      // 2. Traer ítems originales del pedido
      const [itemsPedido] = await connection.query(
        `SELECT id, producto_id, nombre_snapshot, cantidad, precio_unitario, subtotal
         FROM pedido_items
         WHERE pedido_id = ?
         FOR UPDATE`,
        [pedidoId],
      );

      const mapItems = new Map(itemsPedido.map((it) => [it.producto_id, it]));
      let montoAcreditado = 0;

      // 3. Validar cantidades devueltas, actualizar ítems y reponer stock
      for (const devItem of data.items) {
        const orig = mapItems.get(devItem.producto_id);
        if (!orig) {
          const err = new Error(
            `El producto ID ${devItem.producto_id} no pertenece a este pedido`,
          );
          err.statusCode = 400;
          throw err;
        }
        if (devItem.cantidad_devuelta > orig.cantidad) {
          const err = new Error(
            `No podés devolver ${devItem.cantidad_devuelta} de "${orig.nombre_snapshot}" (pedido original: ${orig.cantidad})`,
          );
          err.statusCode = 400;
          throw err;
        }

        const importeItem =
          Number(orig.precio_unitario) * devItem.cantidad_devuelta;
        montoAcreditado += importeItem;

        const nuevaCantidad = orig.cantidad - devItem.cantidad_devuelta;
        const nuevoSubtotal = Number(orig.precio_unitario) * nuevaCantidad;

        await connection.query(
          `UPDATE pedido_items SET cantidad = ?, subtotal = ? WHERE id = ?`,
          [nuevaCantidad, nuevoSubtotal, orig.id],
        );

        // Reponer stock en depósito
        await connection.query(
          `UPDATE productos
           SET stock_actual = stock_actual + ?
           WHERE id = ? AND distribuidora_id = ?`,
          [devItem.cantidad_devuelta, devItem.producto_id, distribuidoraId],
        );
      }

      // 4. Recalcular nuevo total del pedido (si quedó en 0, pasa a CANCELADO)
      const nuevoTotalPedido = Math.max(
        0,
        Number(pedido.total) - montoAcreditado,
      );
      const nuevoEstado = nuevoTotalPedido === 0 ? "CANCELADO" : pedido.estado;

      await connection.query(
        `UPDATE pedidos SET total = ?, estado = ? WHERE id = ?`,
        [nuevoTotalPedido, nuevoEstado, pedidoId],
      );

      // 5. Si el pedido fue en Cuenta Corriente, acreditar el saldo al comercio
      if (
        pedido.condicion_pago === "CUENTA_CORRIENTE" &&
        pedido.cliente_comercio_id
      ) {
        const [cliRows] = await connection.query(
          `SELECT saldo_actual FROM clientes_comercios WHERE id = ? FOR UPDATE`,
          [pedido.cliente_comercio_id],
        );

        if (cliRows.length > 0) {
          const nuevoSaldo = Number(cliRows[0].saldo_actual) - montoAcreditado;

          await connection.query(
            `UPDATE clientes_comercios SET saldo_actual = ? WHERE id = ?`,
            [nuevoSaldo, pedido.cliente_comercio_id],
          );

          await connection.query(
            `INSERT INTO cuenta_corriente_movimientos
             (distribuidora_id, cliente_comercio_id, pedido_id, tipo, monto, saldo_resultante, concepto, registrado_por)
             VALUES (?, ?, ?, 'NOTA_CREDITO', ?, ?, ?, ?)`,
            [
              distribuidoraId,
              pedido.cliente_comercio_id,
              pedidoId,
              montoAcreditado,
              nuevoSaldo,
              `Devolución Pedido ${pedido.numero_pedido}: ${data.motivo}`,
              usuarioId,
            ],
          );
        }
      }

      // 6. Registrar auditoría de la devolución
      await connection.query(
        `INSERT INTO pedido_devoluciones
         (distribuidora_id, pedido_id, usuario_id, motivo, monto_acreditado)
         VALUES (?, ?, ?, ?, ?)`,
        [distribuidoraId, pedidoId, usuarioId, data.motivo, montoAcreditado],
      );

      await connection.commit();

      return {
        pedido_id: pedidoId,
        numero_pedido: pedido.numero_pedido,
        monto_acreditado: montoAcreditado,
        nuevo_total_pedido: nuevoTotalPedido,
        nuevo_estado: nuevoEstado,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = new DevolucionService();
