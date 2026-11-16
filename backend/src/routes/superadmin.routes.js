const { Router } = require("express");
const superAdminController = require("../controllers/superadmin.controller");
const { validate } = require("../middlewares/validate.middleware");
const { authenticate, requireRole } = require("../middlewares/auth.middleware");
const {
  createDistribuidoraSchema,
  updateDistribuidoraStatusSchema,
} = require("../schemas/superadmin.schema");

const router = Router();

router.use(authenticate, requireRole("SUPERADMIN"));

router.get("/distribuidoras", superAdminController.listar);
router.post(
  "/distribuidoras",
  validate(createDistribuidoraSchema),
  superAdminController.crear,
);
router.patch(
  "/distribuidoras/:id",
  validate(updateDistribuidoraStatusSchema),
  superAdminController.actualizar,
);

module.exports = router;
