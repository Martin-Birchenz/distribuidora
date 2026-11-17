const pool = require("../config/db");

const PRECIO_COL_MAP = {
  MINORISTA: "precio_minorista",
  MAYORISTA: "precio_mayorista",
  ESPECIAL: "precio_especial",
};

class PedidoService {
  async crearPedidoTransaccional({
    distribuidoraId,
    userId = null,
    userRole = null,
    payload,
  }) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      let cliente = null;
      if (payload.cliente_comercio_id) {
        const [clienteRows] = await connection.query(
          `SELECT id, nombre_fantasia, credit_limit, current_balance, is_active
           FROM clientes_comercios
           WHERE id = ? AND distribuidora_id = ? AND deleted_at IS NULL
           FOR UPDATE`,
          [payload.cliente_comercio_id, distribuidoraId],
        );

        if (clienteRows.length === 0 || !clienteRows[0].is_active) {
          const err = new Error(
            "El comercio cliente no existe o está inactivo",
          );
          err.statusCode = 404;
          throw err;
        }
        cliente = clienteRows[0];
      }

      const itemsOrdenados = [...payload.items].sort(
        (a, b) => a.producto_id - b.producto_id,
      );
      const precioCol = PRECIO_COL_MAP[payload.lista_aplicada];

      let totalPedido = 0;
      const itemsProcesados = [];

      for (const item of itemsOrdenados) {
        const [prodRows] = await connection.query(
          `SELECT id, sku, nombre, unidad_venta, stock_actual, is_active, ${precioCol} AS precio_lista
           FROM productos
           WHERE id = ? AND distribuidora_id = ? AND deleted_at IS NULL
           FOR UPDATE`,
          [item.producto_id, distribuidoraId],
        );

        if (prodRows.length === 0 || !prodRows[0].is_active) {
          const err = new Error(
            `Producto ID ${item.producto_id} no disponible`,
          );
          err.statusCode = 400;
          throw err;
        }

        const prod = prodRows[0];
        if (prod.stock_actual < item.cantidad) {
          const err = new Error(
            `Stock insuficiente para "${prod.nombre}". Disponible: ${prod.stock_actual}, solicitado: ${item.cantidad}`,
          );
          err.statusCode = 409;
          throw err;
        }

        const precioUnitario = Number(prod.precio_lista);
        const subtotal = Number((precioUnitario * item.cantidad).toFixed(2));
        totalPedido = Number((totalPedido + subtotal).toFixed(2));

        itemsProcesados.push({
          producto_id: prod.id,
          sku_snapshot: prod.sku,
          nombre_snapshot: prod.nombre,
          unidad_snapshot: prod.unidad_venta,
          cantidad: item.cantidad,
          precio_unitario: precioUnitario,
          subtotal,
        });
      }

      // Evaluar límite de crédito incluyendo pedidos ya pendientes de aprobación
      let estadoPedido = "CONFIRMADO";
      if (cliente && payload.condicion_pago === "CUENTA_CORRIENTE") {
        const [pendRows] = await connection.query(
          `SELECT COALESCE(SUM(total), 0) AS total_pendiente
           FROM pedidos
           WHERE distribuidora_id = ? AND cliente_comercio_id = ? AND estado = 'PENDIENTE_APROBACION' AND deleted_at IS NULL`,
          [distribuidoraId, cliente.id],
        );
        const deudaPendienteAprobacion = Number(
          pendRows[0].total_pendiente || 0,
        );
        const saldoProyectado =
          Number(cliente.current_balance) +
          deudaPendienteAprobacion +
          totalPedido;
        const limite = Number(cliente.credit_limit || 0);

        if (limite > 0 && saldoProyectado > limite) {
          // Si es preventista o portal web, queda retenido esperando autorización de Admin
          estadoPedido = "PENDIENTE_APROBACION";
        }
      }

      const numeroPedido = `PED-${Date.now().toString().slice(-7)}-${Math.floor(100 + Math.random() * 900)}`;

      const [pedResult] = await connection.query(
        `INSERT INTO pedidos (
          distribuidora_id, numero_pedido, cliente_comercio_id, preventista_id,
          origen, lista_aplicada, estado, condicion_pago,
          guest_nombre, guest_telefono, guest_direccion, notas, fecha_entrega_estimada, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          distribuidoraId,
          numeroPedido,
          payload.cliente_comercio_id || null,
          userId,
          payload.origen,
          payload.lista_aplicada,
          estadoPedido,
          payload.condicion_pago,
          payload.guest_nombre || null,
          payload.guest_telefono || null,
          payload.guest_direccion || null,
          payload.notas || null,
          payload.fecha_entrega_estimada || null,
          totalPedido,
        ],
      );

      const pedidoId = pedResult.insertId;

      for (const it of itemsProcesados) {
        await connection.query(
          `INSERT INTO pedido_items (
            pedido_id, producto_id, sku_snapshot, nombre_snapshot,
            unidad_snapshot, cantidad, precio_unitario, subtotal
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            pedidoId,
            it.producto_id,
            it.sku_snapshot,
            it.nombre_snapshot,
            it.unidad_snapshot,
            it.cantidad,
            it.precio_unitario,
            it.subtotal,
          ],
        );

        if (estadoPedido === "CONFIRMADO") {
          await connection.query(
            `UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ? AND distribuidora_id = ?`,
            [it.cantidad, it.producto_id, distribuidoraId],
          );
        }
      }

      if (
        cliente &&
        payload.condicion_pago === "CUENTA_CORRIENTE" &&
        estadoPedido === "CONFIRMADO"
      ) {
        const saldoAnterior = Number(cliente.current_balance);
        const saldoPosterior = Number((saldoAnterior + totalPedido).toFixed(2));

        await connection.query(
          `UPDATE clientes_comercios SET current_balance = ? WHERE id = ? AND distribuidora_id = ?`,
          [saldoPosterior, cliente.id, distribuidoraId],
        );

        await connection.query(
          `INSERT INTO cuenta_corriente_movimientos (
            distribuidora_id, cliente_comercio_id, pedido_id, registrado_por_user_id,
            tipo, monto, saldo_anterior, saldo_posterior, observaciones
          ) VALUES (?, ?, ?, ?, 'DEBITO_PEDIDO', ?, ?, ?, ?)`,
          [
            distribuidoraId,
            cliente.id,
            pedidoId,
            userId,
            totalPedido,
            saldoAnterior,
            saldoPosterior,
            `Pedido ${numeroPedido}`,
          ],
        );
      }

      await connection.commit();

      return {
        pedidoId,
        numeroPedido,
        estado: estadoPedido,
        total: totalPedido,
        requiereAprobacionCredito: estadoPedido === "PENDIENTE_APROBACION",
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async listarPedidos(
    distribuidoraId,
    { estado = "", zona = "", fecha = "" } = {},
  ) {
    let sql = `
      SELECT p.id, p.numero_pedido, p.cliente_comercio_id,
             COALESCE(c.nombre_fantasia, p.guest_nombre) AS cliente_nombre,
             COALESCE(c.direccion, p.guest_direccion) AS cliente_direccion,
             c.zona_reparto, c.credit_limit AS cliente_limite_credito,
             c.current_balance AS cliente_saldo_actual,
             u.full_name AS preventista_nombre,
             p.origen, p.lista_aplicada, p.estado, p.condicion_pago,
             p.total, p.notas, p.created_at
      FROM pedidos p
      LEFT JOIN clientes_comercios c ON p.cliente_comercio_id = c.id
      LEFT JOIN users u ON p.preventista_id = u.id
      WHERE p.distribuidora_id = ? AND p.deleted_at IS NULL
    `;
    const params = [distribuidoraId];

    if (estado) {
      sql += ` AND p.estado = ?`;
      params.push(estado);
    }
    if (zona) {
      sql += ` AND c.zona_reparto = ?`;
      params.push(zona);
    }
    if (fecha) {
      sql += ` AND DATE(p.created_at) = ?`;
      params.push(fecha);
    }

    sql += ` ORDER BY p.created_at DESC LIMIT 200`;

    const [rows] = await pool.query(sql, params);
    return rows;
  }

  async obtenerDetallePedido(distribuidoraId, pedidoId) {
    const [pedRows] = await pool.query(
      `SELECT p.*, COALESCE(c.nombre_fantasia, p.guest_nombre) AS cliente_nombre,
              COALESCE(c.direccion, p.guest_direccion) AS cliente_direccion,
              COALESCE(c.telefono, p.guest_telefono) AS cliente_telefono,
              c.zona_reparto, u.full_name AS preventista_nombre
       FROM pedidos p
       LEFT JOIN clientes_comercios c ON p.cliente_comercio_id = c.id
       LEFT JOIN users u ON p.preventista_id = u.id
       WHERE p.id = ? AND p.distribuidora_id = ? AND p.deleted_at IS NULL
       LIMIT 1`,
      [pedidoId, distribuidoraId],
    );

    if (pedRows.length === 0) {
      const err = new Error("Pedido no encontrado");
      err.statusCode = 404;
      throw err;
    }

    const [items] = await pool.query(
      `SELECT id, producto_id, sku_snapshot, nombre_snapshot, unidad_snapshot,
              cantidad, precio_unitario, subtotal
       FROM pedido_items
       WHERE pedido_id = ?`,
      [pedidoId],
    );

    return { ...pedRows[0], items };
  }

  async cambiarEstadoPedido(
    distribuidoraId,
    userId,
    userRole,
    pedidoId,
    nuevoEstado,
  ) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [pedRows] = await connection.query(
        `SELECT * FROM pedidos WHERE id = ? AND distribuidora_id = ? AND deleted_at IS NULL FOR UPDATE`,
        [pedidoId, distribuidoraId],
      );

      if (pedRows.length === 0) {
        const err = new Error("Pedido no encontrado");
        err.statusCode = 404;
        throw err;
      }

      const pedido = pedRows[0];
      if (pedido.estado === nuevoEstado) {
        await connection.commit();
        return { id: pedidoId, estado: nuevoEstado };
      }

      if (pedido.estado === "CANCELADO") {
        const err = new Error("No se puede reactivar un pedido cancelado");
        err.statusCode = 400;
        throw err;
      }

      // Bloquear despacho o entrega directa si el pedido nunca fue aprobado por exceso de crédito
      if (
        pedido.estado === "PENDIENTE_APROBACION" &&
        ["DESPACHADO", "ENTREGADO"].includes(nuevoEstado)
      ) {
        const err = new Error(
          "Este pedido excede el límite de crédito y debe ser APROBADO por Administración antes de despacharlo",
        );
        err.statusCode = 403;
        throw err;
      }

      // Solo ADMIN o SUPERADMIN pueden aprobar un pedido retenido por límite de crédito
      if (
        pedido.estado === "PENDIENTE_APROBACION" &&
        nuevoEstado === "CONFIRMADO"
      ) {
        if (!["ADMIN", "SUPERADMIN"].includes(userRole)) {
          const err = new Error(
            "Solo un Administrador puede autorizar pedidos que superan el límite de crédito",
          );
          err.statusCode = 403;
          throw err;
        }
      }

      const [items] = await connection.query(
        `SELECT producto_id, cantidad, nombre_snapshot FROM pedido_items WHERE pedido_id = ? ORDER BY producto_id ASC`,
        [pedidoId],
      );

      // Caso 1: Aprobar pedido retenido -> Descuenta stock e impacta deuda en CC
      if (
        pedido.estado === "PENDIENTE_APROBACION" &&
        nuevoEstado !== "CANCELADO"
      ) {
        for (const it of items) {
          const [prodRows] = await connection.query(
            `SELECT stock_actual FROM productos WHERE id = ? AND distribuidora_id = ? FOR UPDATE`,
            [it.producto_id, distribuidoraId],
          );
          if (prodRows.length === 0 || prodRows[0].stock_actual < it.cantidad) {
            const err = new Error(
              `Stock insuficiente para aprobar "${it.nombre_snapshot}"`,
            );
            err.statusCode = 409;
            throw err;
          }
          await connection.query(
            `UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ? AND distribuidora_id = ?`,
            [it.cantidad, it.producto_id, distribuidoraId],
          );
        }

        if (
          pedido.cliente_comercio_id &&
          pedido.condicion_pago === "CUENTA_CORRIENTE"
        ) {
          const [cliRows] = await connection.query(
            `SELECT current_balance FROM clientes_comercios WHERE id = ? AND distribuidora_id = ? FOR UPDATE`,
            [pedido.cliente_comercio_id, distribuidoraId],
          );
          const saldoAnterior = Number(cliRows[0].current_balance);
          const saldoPosterior = Number(
            (saldoAnterior + Number(pedido.total)).toFixed(2),
          );

          await connection.query(
            `UPDATE clientes_comercios SET current_balance = ? WHERE id = ? AND distribuidora_id = ?`,
            [saldoPosterior, pedido.cliente_comercio_id, distribuidoraId],
          );

          await connection.query(
            `INSERT INTO cuenta_corriente_movimientos (
              distribuidora_id, cliente_comercio_id, pedido_id, registrado_por_user_id,
              tipo, monto, saldo_anterior, saldo_posterior, observaciones
            ) VALUES (?, ?, ?, ?, 'DEBITO_PEDIDO', ?, ?, ?, ?)`,
            [
              distribuidoraId,
              pedido.cliente_comercio_id,
              pedidoId,
              userId,
              pedido.total,
              saldoAnterior,
              saldoPosterior,
              `Aprobación crédito Pedido ${pedido.numero_pedido}`,
            ],
          );
        }
      }

      // Caso 2: Cancelar pedido confirmado -> Repone stock y revierte deuda en CC
      if (
        nuevoEstado === "CANCELADO" &&
        pedido.estado !== "PENDIENTE_APROBACION"
      ) {
        for (const it of items) {
          await connection.query(
            `UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ? AND distribuidora_id = ?`,
            [it.cantidad, it.producto_id, distribuidoraId],
          );
        }

        if (
          pedido.cliente_comercio_id &&
          pedido.condicion_pago === "CUENTA_CORRIENTE"
        ) {
          const [cliRows] = await connection.query(
            `SELECT current_balance FROM clientes_comercios WHERE id = ? AND distribuidora_id = ? FOR UPDATE`,
            [pedido.cliente_comercio_id, distribuidoraId],
          );
          const saldoAnterior = Number(cliRows[0].current_balance);
          const saldoPosterior = Number(
            (saldoAnterior - Number(pedido.total)).toFixed(2),
          );

          await connection.query(
            `UPDATE clientes_comercios SET current_balance = ? WHERE id = ? AND distribuidora_id = ?`,
            [saldoPosterior, pedido.cliente_comercio_id, distribuidoraId],
          );

          await connection.query(
            `INSERT INTO cuenta_corriente_movimientos (
              distribuidora_id, cliente_comercio_id, pedido_id, registrado_por_user_id,
              tipo, monto, saldo_anterior, saldo_posterior, observaciones
            ) VALUES (?, ?, ?, ?, 'NOTA_CREDITO_DEVOLUCION', ?, ?, ?, ?)`,
            [
              distribuidoraId,
              pedido.cliente_comercio_id,
              pedidoId,
              userId,
              pedido.total,
              saldoAnterior,
              saldoPosterior,
              `Cancelación Pedido ${pedido.numero_pedido}`,
            ],
          );
        }
      }

      await connection.query(
        `UPDATE pedidos SET estado = ? WHERE id = ? AND distribuidora_id = ?`,
        [nuevoEstado, pedidoId, distribuidoraId],
      );

      await connection.commit();
      return {
        id: pedidoId,
        numero_pedido: pedido.numero_pedido,
        estado: nuevoEstado,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async generarHojaCargaCamion(
    distribuidoraId,
    { zona = "", fecha = "" } = {},
  ) {
    let whereExtra = "";
    const params = [distribuidoraId];

    if (zona) {
      whereExtra += ` AND c.zona_reparto = ?`;
      params.push(zona);
    }
    if (fecha) {
      whereExtra += ` AND DATE(p.created_at) = ?`;
      params.push(fecha);
    }

    const [consolidado] = await pool.query(
      `SELECT pi.producto_id, pi.sku_snapshot AS sku, pi.nombre_snapshot AS nombre,
              pi.unidad_snapshot AS unidad_venta, SUM(pi.cantidad) AS total_bultos,
              COUNT(DISTINCT p.id) AS cantidad_pedidos
       FROM pedido_items pi
       INNER JOIN pedidos p ON pi.pedido_id = p.id
       LEFT JOIN clientes_comercios c ON p.cliente_comercio_id = c.id
       WHERE p.distribuidora_id = ?
         AND p.estado IN ('CONFIRMADO', 'EN_PREPARACION')
         AND p.deleted_at IS NULL
         ${whereExtra}
       GROUP BY pi.producto_id, pi.sku_snapshot, pi.nombre_snapshot, pi.unidad_snapshot
       ORDER BY pi.nombre_snapshot ASC`,
      params,
    );

    const [remitos] = await pool.query(
      `SELECT p.id, p.numero_pedido,
              COALESCE(c.nombre_fantasia, p.guest_nombre) AS comercio,
              COALESCE(c.direccion, p.guest_direccion) AS direccion,
              c.zona_reparto, p.condicion_pago, p.total
       FROM pedidos p
       LEFT JOIN clientes_comercios c ON p.cliente_comercio_id = c.id
       WHERE p.distribuidora_id = ?
         AND p.estado IN ('CONFIRMADO', 'EN_PREPARACION')
         AND p.deleted_at IS NULL
         ${whereExtra}
       ORDER BY c.zona_reparto ASC, comercio ASC`,
      params,
    );

    const totalCargaMonto = remitos.reduce(
      (acc, r) => acc + Number(r.total),
      0,
    );

    return {
      fecha_emision: new Date().toISOString(),
      filtros: { zona: zona || "TODAS", fecha: fecha || "TODOS_PENDIENTES" },
      resumen: {
        total_remitos: remitos.length,
        total_skus: consolidado.length,
        total_bultos_fisicos: consolidado.reduce(
          (acc, i) => acc + Number(i.total_bultos),
          0,
        ),
        monto_total_reparto: Number(totalCargaMonto.toFixed(2)),
      },
      consolidado_deposito: consolidado,
      remitos_reparto: remitos,
    };
  }
}

module.exports = new PedidoService();
