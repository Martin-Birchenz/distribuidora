const { Router } = require("express");
const authController = require("../controllers/auth.controller");
const { validate } = require("../middlewares/validate.middleware");
const { resolvePublicTenant } = require("../middlewares/tenant.middleware");
const { portalComercioLoginSchema } = require("../schemas/auth.schema");
const catalogoController = require("../controllers/catalogo.controller");
const pedidoController = require("../controllers/pedido.controller");
const { crearPedidoPublicoSchema } = require("../schemas/pedido.schema");

const router = Router({ mergeParams: true });

router.use(resolvePublicTenant);

router.get("/bootstrap", authController.getPublicBootstrap);
router.post(
  "/login-comercio",
  validate(portalComercioLoginSchema),
  authController.loginPublicComercio,
);
router.get("/catalogo", catalogoController.getCatalogoPublico);
router.post(
  "/pedidos",
  validate(crearPedidoPublicoSchema),
  pedidoController.crearPublico,
);

module.exports = router;
