const bcrypt = require("bcryptjs");
const pool = require("../config/db");

class SuperAdminService {
  async listarDistribuidoras() {
    const [rows] = await pool.query(
      `SELECT d.id, d.razon_social, d.nombre_fantasia, d.cuit, d.slug, d.plan_type,
              d.has_web_portal, d.has_ai_addon, d.max_preventistas, d.is_active, d.created_at,
              (SELECT COUNT(*) FROM users u WHERE u.distribuidora_id = d.id AND u.role = 'PREVENTISTA' AND u.is_active = 1 AND u.deleted_at IS NULL) AS preventistas_activos,
              (SELECT COUNT(*) FROM pedidos p WHERE p.distribuidora_id = d.id AND p.deleted_at IS NULL) AS total_pedidos
       FROM distribuidoras d
       WHERE d.deleted_at IS NULL
       ORDER BY d.created_at DESC`,
    );
    return rows;
  }

  async crearDistribuidoraConSeed(data) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const hasWebPortal =
        data.plan_type === "FULL" ? 1 : data.has_web_portal ? 1 : 0;

      const [distRes] = await connection.query(
        `INSERT INTO distribuidoras (
          razon_social, nombre_fantasia, cuit, slug, plan_type,
          has_web_portal, has_ai_addon, max_preventistas
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.razon_social,
          data.nombre_fantasia,
          data.cuit,
          data.slug,
          data.plan_type,
          hasWebPortal,
          data.has_ai_addon ? 1 : 0,
          data.max_preventistas,
        ],
      );

      const distribuidoraId = distRes.insertId;

      await connection.query(
        `INSERT INTO distribuidora_settings (
          distribuidora_id, primary_color, secondary_color, accent_color, whatsapp_pedidos
        ) VALUES (?, ?, ?, ?, ?)`,
        [
          distribuidoraId,
          data.primary_color,
          data.secondary_color,
          data.accent_color,
          data.whatsapp_pedidos || null,
        ],
      );

      await connection.query(
        `INSERT INTO categorias (distribuidora_id, nombre, orden) VALUES (?, 'General', 1)`,
        [distribuidoraId],
      );

      const passwordHash = await bcrypt.hash(data.admin_password, 10);
      await connection.query(
        `INSERT INTO users (distribuidora_id, full_name, email, password_hash, role)
         VALUES (?, ?, ?, ?, 'ADMIN')`,
        [distribuidoraId, data.admin_name, data.admin_email, passwordHash],
      );

      await connection.commit();

      return {
        id: distribuidoraId,
        nombre_fantasia: data.nombre_fantasia,
        slug: data.slug,
        plan_type: data.plan_type,
        admin_email: data.admin_email,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async actualizarDistribuidora(id, updates) {
    const fields = [];
    const values = [];

    if (updates.is_active !== undefined) {
      fields.push("is_active = ?");
      values.push(updates.is_active ? 1 : 0);
    }
    if (updates.plan_type !== undefined) {
      fields.push("plan_type = ?");
      values.push(updates.plan_type);
      if (
        updates.plan_type === "FULL" &&
        updates.has_web_portal === undefined
      ) {
        fields.push("has_web_portal = 1");
      }
    }
    if (updates.has_web_portal !== undefined) {
      fields.push("has_web_portal = ?");
      values.push(updates.has_web_portal ? 1 : 0);
    }
    if (updates.has_ai_addon !== undefined) {
      fields.push("has_ai_addon = ?");
      values.push(updates.has_ai_addon ? 1 : 0);
    }
    if (updates.max_preventistas !== undefined) {
      fields.push("max_preventistas = ?");
      values.push(updates.max_preventistas);
    }

    if (fields.length === 0) return { updated: false };

    values.push(id);
    await pool.query(
      `UPDATE distribuidoras SET ${fields.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
      values,
    );

    return { updated: true };
  }
}

module.exports = new SuperAdminService();
