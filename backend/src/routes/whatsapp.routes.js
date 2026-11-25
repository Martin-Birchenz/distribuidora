const { Router } = require("express");
const whatsappController = require("../controllers/whatsapp.controller");
const { authenticate } = require("../middlewares/auth.middleware");

const router = Router();

router.get("/webhook", whatsappController.verificarWebhook);
router.post("/webhook", whatsappController.recibirWebhook);

router.post("/simular", authenticate, whatsappController.simularMensajeInterno);

module.exports = router;
