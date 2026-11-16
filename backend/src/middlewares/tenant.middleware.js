const pool = require("../config/db");

const requireInternalTenant = async (req, res, next) => {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "No autenticado" });
    }

    // SuperAdmin puede auditar o configurar cualquier distribuidora vía header
    if (req.user.role === "SUPERADMIN") {
      const targetId = Number(req.headers["x-distribuidora-id"]);
      if (!targetId) {
        return res.status(400).json({
          success: false,
          message: "SuperAdmin debe especificar el header x-distribuidora-id",
        });
      }
      req.distribuidoraId = targetId;
      return next();
    }

    if (!req.user.distribuidoraId) {
      return res.status(403).json({
        success: false,
        message: "Usuario sin distribuidora asignada",
      });
    }

    const [rows] = await pool.query(
      "SELECT is_active FROM distribuidoras WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      [req.user.distribuidoraId],
    );

    if (rows.length === 0 || !rows[0].is_active) {
      return res.status(403).json({
        success: false,
        message:
          "Acceso pausado: cuenta de distribuidora suspendida o inactiva",
      });
    }

    req.distribuidoraId = req.user.distribuidoraId;
    next();
  } catch (error) {
    next(error);
  }
};

const resolvePublicTenant = async (req, res, next) => {
  try {
    const slug = (req.params.slug || req.headers["x-tenant-slug"] || "")
      .toLowerCase()
      .trim();

    if (!slug) {
      return res.status(400).json({
        success: false,
        message: "Identificador de tienda (slug) requerido",
      });
    }

    const [rows] = await pool.query(
      `SELECT id, nombre_fantasia, slug, plan_type, has_web_portal, is_active
       FROM distribuidoras
       WHERE slug = ? AND deleted_at IS NULL
       LIMIT 1`,
      [slug],
    );

    if (rows.length === 0 || !rows[0].is_active) {
      return res.status(404).json({
        success: false,
        message: "Tienda no encontrada o temporalmente inactiva",
      });
    }

    if (!rows[0].has_web_portal) {
      return res.status(403).json({
        success: false,
        message: "Esta distribuidora no tiene habilitado el portal web público",
      });
    }

    req.distribuidoraId = rows[0].id;
    req.distribuidora = rows[0];
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { requireInternalTenant, resolvePublicTenant };
