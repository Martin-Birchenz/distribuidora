const { Router } = require("express");
const multer = require("multer");
const catalogoController = require("../controllers/catalogo.controller");
const clienteController = require("../controllers/cliente.controller");
const { authenticate, requireRole } = require("../middlewares/auth.middleware");
const { requireInternalTenant } = require("../middlewares/tenant.middleware");
const { validate } = require("../middlewares/validate.middleware");
const {
  createCategoriaSchema,
  createProductoSchema,
  updateProductoSchema,
  ajusteStockSchema,
} = require("../schemas/catalogo.schema");
const {
  createClienteSchema,
  updateClienteSchema,
} = require("../schemas/cliente.schema");

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máx
});
const pedidoController = require("../controllers/pedido.controller");
const {
  crearPedidoInternoSchema,
  cambiarEstadoPedidoSchema,
} = require("../schemas/pedido.schema");
const {
  registrarCobranzaSchema,
} = require("../schemas/cuentaCorriente.schema");
const aiParserService = require("../services/aiParser.service");
const { sendSuccess } = require("../middlewares/response.middleware");
const devolucionService = require("../services/devolucion.service");
const { sendSuccess } = require("../middlewares/response.middleware");
const repartoService = require("../services/reparto.service");
const dashboardService = require("../services/dashboard.service");
const { sendSuccess } = require("../middlewares/response.middleware");

router.use(authenticate, requireInternalTenant);

// Categorías y Productos
router.get("/categorias", catalogoController.getCategorias);
router.post(
  "/categorias",
  requireRole("SUPERADMIN", "ADMIN"),
  validate(createCategoriaSchema),
  catalogoController.postCategoria,
);

router.get("/productos", catalogoController.getProductosInterno);
router.post(
  "/productos",
  requireRole("SUPERADMIN", "ADMIN", "DEPOSITO"),
  validate(createProductoSchema),
  catalogoController.postProducto,
);
router.patch(
  "/productos/:id",
  requireRole("SUPERADMIN", "ADMIN", "DEPOSITO"),
  validate(updateProductoSchema),
  catalogoController.patchProducto,
);
router.post(
  "/productos/:id/stock",
  requireRole("SUPERADMIN", "ADMIN", "DEPOSITO"),
  validate(ajusteStockSchema),
  catalogoController.postAjusteStock,
);
router.post(
  "/productos/import-excel",
  requireRole("SUPERADMIN", "ADMIN"),
  upload.single("file"),
  catalogoController.importExcel,
);

// Comercios Clientes
router.get("/clientes", clienteController.listar);
router.post(
  "/clientes",
  requireRole("SUPERADMIN", "ADMIN", "PREVENTISTA"),
  validate(createClienteSchema),
  clienteController.crear,
);
router.patch(
  "/clientes/:id",
  requireRole("SUPERADMIN", "ADMIN"),
  validate(updateClienteSchema),
  clienteController.actualizar,
);
// Pedidos y Comanda Consolidada de Camión
router.get("/pedidos", pedidoController.listar);
router.get("/pedidos/hoja-carga", pedidoController.hojaCarga);
router.get("/pedidos/:id", pedidoController.detalle);
router.post(
  "/pedidos",
  validate(crearPedidoInternoSchema),
  pedidoController.crearInterno,
);
router.patch(
  "/pedidos/:id/estado",
  requireRole("SUPERADMIN", "ADMIN", "DEPOSITO"),
  validate(cambiarEstadoPedidoSchema),
  pedidoController.cambiarEstado,
);

// Cuentas Corrientes y Cobranzas
router.get("/cuentas-corrientes/resumen", pedidoController.getResumenDeudores);
router.get(
  "/cuentas-corrientes/:clienteId",
  pedidoController.getCuentaCorrienteCliente,
);
router.post(
  "/cuentas-corrientes/cobranzas",
  validate(registrarCobranzaSchema),
  pedidoController.postCobranza,
);
router.get(
  "/productos/plantilla-excel",
  catalogoController.descargarPlantillaExcel,
);
router.post(
  "/pedidos/parse-whatsapp",
  upload.single("audio"),
  async (req, res, next) => {
    try {
      const texto = req.body?.texto || "";
      if (!texto.trim() && !req.file) {
        const err = new Error(
          "Enviá un texto de WhatsApp o un archivo de audio",
        );
        err.statusCode = 400;
        throw err;
      }
      const data = await aiParserService.parsearPedidoWhatsApp(
        req.distribuidoraId,
        {
          texto,
          audioFile: req.file || null,
        },
      );
      return sendSuccess(res, data, "Pedido procesado por IA");
    } catch (error) {
      next(error);
    }
  },
);

router.get("/pedidos/:id/remito-pdf", pedidoController.descargarRemitoPdf);

router.post(
  "/pedidos/:id/devoluciones",
  requireRole(["ADMIN_DIST", "DEPOSITO"]),
  async (req, res, next) => {
    try {
      const result = await devolucionService.procesarDevolucion(
        req.distribuidoraId,
        Number(req.params.id),
        req.user.userId,
        req.body,
      );
      return sendSuccess(
        res,
        result,
        "Devolución registrada y stock/saldo actualizados",
      );
    } catch (error) {
      next(error);
    }
  },
);

router.get("/reparto/hoja-ruta", async (req, res, next) => {
  try {
    const fecha = req.query.fecha || null;
    const data = await repartoService.obtenerHojaDeRuta(
      req.distribuidoraId,
      fecha,
    );
    return sendSuccess(res, data, "Hoja de ruta por zona generada");
  } catch (error) {
    next(error);
  }
});

router.post("/reparto/cobros", async (req, res, next) => {
  try {
    const result = await repartoService.registrarCobroEnCalle(
      req.distribuidoraId,
      req.user.userId,
      req.body,
    );
    return sendSuccess(res, result, "Cobro registrado en cuenta corriente");
  } catch (error) {
    next(error);
  }
});

router.get(
  "/dashboard/resumen",
  requireRole(["ADMIN_DIST"]),
  async (req, res, next) => {
    try {
      const data = await dashboardService.obtenerResumenEjecutivo(
        req.distribuidoraId,
      );
      return sendSuccess(res, data, "Resumen ejecutivo generado");
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
