const { Router } = require("express");
const aiParserService = require("../services/aiParser.service");
const catalogoService = require("../services/catalogo.service");
const { sendSuccess } = require("../middlewares/response.middleware");
const { requireRole } = require("../middlewares/auth.middleware");

const router = Router();

// Texto de WhatsApp (sin audio) -> Armar carrito IA
router.post("/pedidos/parse-whatsapp", async (req, res, next) => {
  try {
    const texto = req.body?.texto || "";
    if (!String(texto).trim()) {
      const err = new Error(
        "Pegá un mensaje de texto de WhatsApp para analizar.",
      );
      err.statusCode = 400;
      throw err;
    }
    const data = await aiParserService.parsearPedidoTextoWhatsApp(
      req.distribuidoraId,
      texto,
    );
    return sendSuccess(res, data, "Pedido procesado por IA");
  } catch (error) {
    next(error);
  }
});

// Sugerencia de costos y precios mayoristas desde lista de proveedor (IA)
router.post(
  "/productos/sugerir-precios-ia",
  requireRole("SUPERADMIN", "ADMIN"),
  async (req, res, next) => {
    try {
      const { lista_texto = "", margen_porcentaje = 20 } = req.body || {};
      const data = await aiParserService.sugerirActualizacionListaProveedor(
        req.distribuidoraId,
        lista_texto,
        margen_porcentaje,
      );
      return sendSuccess(res, data, "Sugerencias de precios generadas");
    } catch (error) {
      next(error);
    }
  },
);

// Aplicar sugerencias aprobadas por el usuario
router.post(
  "/productos/aplicar-precios-ia",
  requireRole("SUPERADMIN", "ADMIN"),
  async (req, res, next) => {
    try {
      const { items = [] } = req.body || {};
      let actualizados = 0;

      for (const item of items) {
        if (!item?.producto_id) continue;
        await catalogoService.actualizarProducto(
          req.distribuidoraId,
          Number(item.producto_id),
          {
            costo_reposicion: Number(item.nuevo_costo),
            precio_mayorista: Number(item.nuevo_precio_mayorista),
          },
        );
        actualizados++;
      }

      return sendSuccess(
        res,
        { actualizados },
        `${actualizados} productos actualizados`,
      );
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
