const { Router } = require("express");
const authController = require("../controllers/auth.controller");
const { validate } = require("../middlewares/validate.middleware");
const { authenticate } = require("../middlewares/auth.middleware");
const { requireInternalTenant } = require("../middlewares/tenant.middleware");
const { loginSchema } = require("../schemas/auth.schema");

const router = Router();

router.post("/login", validate(loginSchema), authController.login);
router.get(
  "/bootstrap",
  authenticate,
  requireInternalTenant,
  authController.getInternalBootstrap,
);

module.exports = router;
