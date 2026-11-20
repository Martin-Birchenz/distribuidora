const pool = require("../config/db");

class DashboardService {
  async registrarAuditoria(
    distribuidoraId,
    usuarioId,
    accion,
    entidad,
    entidadId,
    detalle,
  ) {
    try {
      await pool.query(
        `INSERT INTO audit_logs (distribuidora_id, usuario_id, accion, entidad, entidad_id, detalle)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          distribuidoraId,
          usuarioId || null,
          accion,
          entidad,
          entidadId || null,
          detalle,
        ],
      );
    } catch (err) {
      console.error("Error registrando audit_log:", err.message);
    }
  }

  async obtenerResumenEjecutivo(distribuidoraId) {
    const [[ventasStats]] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN total ELSE 0 END), 0) AS ventas_hoy,
         COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) AS pedidos_hoy,
         COALESCE(SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE()) THEN total ELSE 0 END), 0) AS ventas_mes,
         COUNT(CASE WHEN estado = 'PENDIENTE_APROBACION' THEN 1 END) AS pendientes_aprobacion
       FROM pedidos
       WHERE distribuidora_id = ? AND deleted_at IS NULL AND estado != 'CANCELADO'`,
      [distribuidoraId],
    );

    const [[carteraStats]] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN saldo_actual > 0 THEN saldo_actual ELSE 0 END), 0) AS total_en_calle,
         COUNT(CASE WHEN saldo_actual > credit_limit AND credit_limit > 0 THEN 1 END) AS comercios_excedidos
       FROM clientes_comercios
       WHERE distribuidora_id = ? AND deleted_at IS NULL`,
      [distribuidoraId],
    );

    const [topDeudores] = await pool.query(
      `SELECT id, nombre_fantasia, zona AS zona_reparto, saldo_actual, credit_limit
       FROM clientes_comercios
       WHERE distribuidora_id = ? AND deleted_at IS NULL AND saldo_actual > 0
       ORDER BY saldo_actual DESC
       LIMIT 5`,
      [distribuidoraId],
    );

    const [stockCritico] = await pool.query(
      `SELECT id, sku, nombre, unidad_venta, stock_actual
       FROM productos
       WHERE distribuidora_id = ? AND is_active = 1 AND deleted_at IS NULL AND stock_actual <= 10
       ORDER BY stock_actual ASC
       LIMIT 8`,
      [distribuidoraId],
    );

    const [ultimosLogs] = await pool.query(
      `SELECT a.id, a.accion, a.entidad, a.detalle, a.created_at, u.full_name AS usuario_nombre
       FROM audit_logs a
       LEFT JOIN users u ON a.usuario_id = u.id
       WHERE a.distribuidora_id = ?
       ORDER BY a.created_at DESC
       LIMIT 10`,
      [distribuidoraId],
    );

    return {
      kpis: {
        ventas_hoy: Number(ventasStats.ventas_hoy),
        pedidos_hoy: Number(ventasStats.pedidos_hoy),
        ventas_mes: Number(ventasStats.ventas_mes),
        pendientes_aprobacion: Number(ventasStats.pendientes_aprobacion),
        total_en_calle: Number(carteraStats.total_en_calle),
        comercios_excedidos: Number(carteraStats.comercios_excedidos),
      },
      top_deudores: topDeudores,
      stock_critico: stockCritico,
      ultimos_logs: ultimosLogs,
    };
  }
}

module.exports = new DashboardService();
