const { Router } = require("express");
const multer = require("multer");
const catalogoController = require("../controllers/catalogo.controller");
const clienteController = require("../controllers/cliente.controller");
const pedidoController = require("../controllers/pedido.controller");
const { authenticate, requireRole } = require("../middlewares/auth.middleware");
const { requireInternalTenant } = require("../middlewares/tenant.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { sendSuccess } = require("../middlewares/response.middleware");
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
const {
  crearPedidoInternoSchema,
  cambiarEstadoPedidoSchema,
} = require("../schemas/pedido.schema");
const {
  registrarCobranzaSchema,
} = require("../schemas/cuentaCorriente.schema");
const aiParserService = require("../services/aiParser.service");
const devolucionService = require("../services/devolucion.service");
const repartoService = require("../services/reparto.service");
const dashboardService = require("../services/dashboard.service");
const arcaFacturacionService = require("../services/arcaFacturacion.service");

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

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
router.get(
  "/productos/plantilla-excel",
  catalogoController.descargarPlantillaExcel,
);
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

// Pedidos, Comanda Consolidada, Remito PDF, IA WhatsApp, Devoluciones y Facturación Masiva ARCA
router.get("/pedidos", pedidoController.listar);
router.get("/pedidos/hoja-carga", pedidoController.hojaCarga);
router.get("/pedidos/:id", pedidoController.detalle);
router.get("/pedidos/:id/remito-pdf", pedidoController.descargarRemitoPdf);
router.post(
  "/pedidos",
  validate(crearPedidoInternoSchema),
  pedidoController.crearInterno,
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
router.patch(
  "/pedidos/:id/estado",
  requireRole("SUPERADMIN", "ADMIN", "DEPOSITO"),
  validate(cambiarEstadoPedidoSchema),
  pedidoController.cambiarEstado,
);
router.post(
  "/pedidos/:id/devoluciones",
  requireRole("SUPERADMIN", "ADMIN", "DEPOSITO"),
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
router.post(
  "/facturacion/lote",
  requireRole("SUPERADMIN", "ADMIN"),
  async (req, res, next) => {
    try {
      const result = await arcaFacturacionService.emitirLoteFacturas(
        req.distribuidoraId,
        req.body,
      );
      return sendSuccess(
        res,
        result,
        `Lote ARCA procesado: ${result.total_emitidos} emitidos`,
      );
    } catch (error) {
      next(error);
    }
  },
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

// Hoja de Ruta, Asignación de Camión, Cobranza en Calle y Cierre de Rendición
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

router.post(
  "/reparto/asignar-camion",
  requireRole("SUPERADMIN", "ADMIN", "DEPOSITO"),
  async (req, res, next) => {
    try {
      const result = await repartoService.asignarCamionLote(
        req.distribuidoraId,
        req.body,
      );
      return sendSuccess(res, result, "Camión asignado a los pedidos");
    } catch (error) {
      next(error);
    }
  },
);

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

router.post(
  "/reparto/rendiciones",
  requireRole("SUPERADMIN", "ADMIN", "DEPOSITO"),
  async (req, res, next) => {
    try {
      const result = await repartoService.cerrarRendicionReparto(
        req.distribuidoraId,
        req.user.userId,
        req.body,
      );
      return sendSuccess(res, result, "Cierre de reparto registrado");
    } catch (error) {
      next(error);
    }
  },
);

// Dashboard Ejecutivo
router.get(
  "/dashboard/resumen",
  requireRole("SUPERADMIN", "ADMIN"),
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
