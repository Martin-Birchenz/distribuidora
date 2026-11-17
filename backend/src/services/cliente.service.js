const bcrypt = require("bcryptjs");
const pool = require("../config/db");

class ClienteService {
  async listarComercios(distribuidoraId, { q = "", zona = "" } = {}) {
    let sql = `
    SELECT c.id, c.codigo_interno, c.nombre_fantasia, c.razon_social, c.cuit, c.telefono,
           c.direccion, c.zona_reparto, c.lista_precio_default, c.credit_limit,
           c.current_balance, c.web_access_enabled, c.is_active,
           COALESCE((
             SELECT SUM(p.total)
             FROM pedidos p
             WHERE p.cliente_comercio_id = c.id
               AND p.distribuidora_id = c.distribuidora_id
               AND p.estado = 'PENDIENTE_APROBACION'
               AND p.deleted_at IS NULL
           ), 0) AS deuda_pendiente_aprobacion
    FROM clientes_comercios c
    WHERE c.distribuidora_id = ? AND c.deleted_at IS NULL
  `;
    const params = [distribuidoraId];

    if (q) {
      sql += ` AND (c.nombre_fantasia LIKE ? OR c.razon_social LIKE ? OR c.cuit LIKE ? OR c.codigo_interno LIKE ?)`;
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (zona) {
      sql += ` AND c.zona_reparto = ?`;
      params.push(zona);
    }

    sql += ` ORDER BY c.nombre_fantasia ASC`;
    const [rows] = await pool.query(sql, params);
    return rows;
  }

  async crearComercio(distribuidoraId, userId, data) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const webPinHash = data.web_pin
        ? await bcrypt.hash(data.web_pin, 10)
        : null;
      const saldoInicial = Number(data.saldo_inicial || 0);

      const [res] = await connection.query(
        `INSERT INTO clientes_comercios (
          distribuidora_id, codigo_interno, nombre_fantasia, razon_social, cuit,
          telefono, direccion, zona_reparto, lista_precio_default,
          credit_limit, current_balance, web_access_enabled, web_pin_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          distribuidoraId,
          data.codigo_interno || null,
          data.nombre_fantasia,
          data.razon_social || null,
          data.cuit || null,
          data.telefono || null,
          data.direccion,
          data.zona_reparto || null,
          data.lista_precio_default,
          data.credit_limit,
          saldoInicial,
          data.web_access_enabled ? 1 : 0,
          webPinHash,
        ],
      );

      const clienteId = res.insertId;

      if (saldoInicial !== 0) {
        await connection.query(
          `INSERT INTO cuenta_corriente_movimientos (
            distribuidora_id, cliente_comercio_id, registrado_por_user_id,
            tipo, monto, saldo_anterior, saldo_posterior, observaciones
          ) VALUES (?, ?, ?, 'AJUSTE_MANUAL', ?, 0, ?, 'Saldo inicial de alta')`,
          [
            distribuidoraId,
            clienteId,
            userId,
            Math.abs(saldoInicial),
            saldoInicial,
          ],
        );
      }

      await connection.commit();
      return {
        id: clienteId,
        nombre_fantasia: data.nombre_fantasia,
        current_balance: saldoInicial,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async actualizarComercio(distribuidoraId, clienteId, updates) {
    const fields = [];
    const values = [];

    const allowed = [
      "codigo_interno",
      "nombre_fantasia",
      "razon_social",
      "cuit",
      "telefono",
      "direccion",
      "zona_reparto",
      "lista_precio_default",
      "credit_limit",
    ];

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    }

    if (updates.web_access_enabled !== undefined) {
      fields.push("web_access_enabled = ?");
      values.push(updates.web_access_enabled ? 1 : 0);
    }

    if (updates.is_active !== undefined) {
      fields.push("is_active = ?");
      values.push(updates.is_active ? 1 : 0);
    }

    if (updates.web_pin) {
      const hash = await bcrypt.hash(updates.web_pin, 10);
      fields.push("web_pin_hash = ?");
      values.push(hash);
    }

    if (fields.length === 0) return { updated: false };

    values.push(clienteId, distribuidoraId);
    const [res] = await pool.query(
      `UPDATE clientes_comercios SET ${fields.join(", ")} WHERE id = ? AND distribuidora_id = ? AND deleted_at IS NULL`,
      values,
    );

    if (res.affectedRows === 0) {
      const err = new Error("Comercio cliente no encontrado");
      err.statusCode = 404;
      throw err;
    }

    return { updated: true };
  }
}

module.exports = new ClienteService();
