const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

class AuthService {
  async loginInterno({ email, password }) {
    const [rows] = await pool.query(
      `SELECT u.id, u.distribuidora_id, u.full_name, u.email, u.password_hash, u.role, u.is_active,
              d.nombre_fantasia AS distribuidora_nombre, d.slug AS distribuidora_slug,
              d.plan_type, d.has_web_portal, d.has_ai_addon, d.is_active AS distribuidora_activa
       FROM users u
       LEFT JOIN distribuidoras d ON u.distribuidora_id = d.id AND d.deleted_at IS NULL
       WHERE u.email = ? AND u.deleted_at IS NULL
       LIMIT 1`,
      [email],
    );

    if (rows.length === 0) {
      const err = new Error("Credenciales inválidas");
      err.statusCode = 401;
      throw err;
    }

    const user = rows[0];
    if (!user.is_active) {
      const err = new Error("Usuario deshabilitado");
      err.statusCode = 403;
      throw err;
    }

    if (user.role !== "SUPERADMIN" && !user.distribuidora_activa) {
      const err = new Error(
        "La cuenta de la distribuidora se encuentra suspendida",
      );
      err.statusCode = 403;
      throw err;
    }

    const validPass = await bcrypt.compare(password, user.password_hash);
    if (!validPass) {
      const err = new Error("Credenciales inválidas");
      err.statusCode = 401;
      throw err;
    }

    const token = jwt.sign(
      {
        userId: user.id,
        distribuidoraId: user.distribuidora_id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "12h" },
    );

    return {
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        distribuidoraId: user.distribuidora_id,
        distribuidoraNombre: user.distribuidora_nombre,
        distribuidoraSlug: user.distribuidora_slug,
        planType: user.plan_type,
        hasWebPortal: Boolean(user.has_web_portal),
        hasAiAddon: Boolean(user.has_ai_addon),
      },
    };
  }

  async loginComercioPublico(distribuidoraId, { identificador, pin }) {
    const [rows] = await pool.query(
      `SELECT id, nombre_fantasia, cuit, lista_precio_default, credit_limit, current_balance, web_access_enabled, web_pin_hash
       FROM clientes_comercios
       WHERE distribuidora_id = ?
         AND (cuit = ? OR codigo_interno = ?)
         AND is_active = 1
         AND deleted_at IS NULL
       LIMIT 1`,
      [distribuidoraId, identificador, identificador],
    );

    if (
      rows.length === 0 ||
      !rows[0].web_access_enabled ||
      !rows[0].web_pin_hash
    ) {
      const err = new Error(
        "Comercio no encontrado o sin acceso web mayorista habilitado",
      );
      err.statusCode = 401;
      throw err;
    }

    const comercio = rows[0];
    const validPin = await bcrypt.compare(pin, comercio.web_pin_hash);
    if (!validPin) {
      const err = new Error("PIN de acceso incorrecto");
      err.statusCode = 401;
      throw err;
    }

    const token = jwt.sign(
      {
        comercioId: comercio.id,
        distribuidoraId,
        type: "COMERCIO_B2B",
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" },
    );

    return {
      token,
      comercio: {
        id: comercio.id,
        nombreFantasia: comercio.nombre_fantasia,
        listaPrecioDefault: comercio.lista_precio_default,
        creditLimit: comercio.credit_limit,
        currentBalance: comercio.current_balance,
      },
    };
  }

  async getBootstrap(distribuidoraId) {
    const [rows] = await pool.query(
      `SELECT d.id, d.nombre_fantasia, d.slug, d.plan_type, d.has_web_portal, d.has_ai_addon,
              s.logo_url, s.banner_url, s.primary_color, s.secondary_color, s.accent_color,
              s.bg_color, s.surface_color, s.text_color, s.whatsapp_pedidos,
              s.bank_alias, s.bank_cbu, s.bank_titular, s.min_order_web
       FROM distribuidoras d
       INNER JOIN distribuidora_settings s ON d.id = s.distribuidora_id
       WHERE d.id = ? AND d.deleted_at IS NULL
       LIMIT 1`,
      [distribuidoraId],
    );

    if (rows.length === 0) {
      const err = new Error("Configuración de distribuidora no encontrada");
      err.statusCode = 404;
      throw err;
    }

    return rows[0];
  }
}

module.exports = new AuthService();
