const { Router } = require("express");
const whatsappController = require("../controllers/whatsapp.controller");

const router = Router();

router.get("/webhook", whatsappController.verificarWebhook);
router.post("/webhook", whatsappController.recibirWebhook);

module.exports = router;
