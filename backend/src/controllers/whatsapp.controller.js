const whatsappAssistantService = require("../services/whatsappAssistant.service");
const { sendSuccess } = require("../middlewares/response.middleware");

class WhatsAppController {
  verificarWebhook(req, res) {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    if (mode === "subscribe" && verifyToken && token === verifyToken) {
      return res.status(200).send(challenge);
    }

    return res.status(403).json({
      success: false,
      message: "Verificación de webhook de WhatsApp rechazada",
    });
  }

  async recibirWebhook(req, res, next) {
    try {
      const body = req.body || {};
      const entries = Array.isArray(body.entry) ? body.entry : [];
      const resultados = [];

      for (const entry of entries) {
        const changes = Array.isArray(entry.changes) ? entry.changes : [];
        for (const change of changes) {
          const value = change?.value || {};
          const phoneNumberId = value?.metadata?.phone_number_id || null;
          const messages = Array.isArray(value?.messages) ? value.messages : [];

          for (const msg of messages) {
            const from = msg?.from;
            if (!from) continue;

            if (msg.type === "text") {
              const texto = msg?.text?.body || "";
              const resMsg =
                await whatsappAssistantService.procesarMensajeEntrante({
                  telefono: from,
                  texto,
                  phoneNumberId,
                  enviarPorWhatsApp: true,
                });
              resultados.push(resMsg);
            } else if (msg.type === "audio") {
              const mediaId = msg?.audio?.id;
              if (!mediaId) continue;
              const audioDescargado =
                await whatsappAssistantService.descargarAudioWhatsApp(mediaId);
              const resAudio =
                await whatsappAssistantService.procesarMensajeEntrante({
                  telefono: from,
                  audioBase64: audioDescargado.buffer.toString("base64"),
                  audioMimeType: audioDescargado.mimeType,
                  phoneNumberId,
                  enviarPorWhatsApp: true,
                });
              resultados.push(resAudio);
            }
          }
        }
      }

      return res.status(200).json({
        success: true,
        procesados: resultados.length,
        resultados,
      });
    } catch (error) {
      next(error);
    }
  }

  async simularMensajeInterno(req, res, next) {
    try {
      const {
        telefono = "",
        texto = "",
        audioBase64 = null,
        audioMimeType = "audio/ogg",
        enviarPorWhatsApp = false,
      } = req.body || {};

      let finalAudioBase64 = audioBase64;
      let finalMimeType = audioMimeType;

      if (req.file) {
        finalAudioBase64 = req.file.buffer.toString("base64");
        finalMimeType = req.file.mimetype || "audio/ogg";
      }

      if (!String(texto).trim() && !finalAudioBase64) {
        const err = new Error(
          "Enviá un texto o un archivo de audio para simular el mensaje de WhatsApp.",
        );
        err.statusCode = 400;
        throw err;
      }

      const data = await whatsappAssistantService.procesarMensajeEntrante({
        telefono,
        texto,
        audioBase64: finalAudioBase64,
        audioMimeType: finalMimeType,
        distribuidoraIdForzada: req.distribuidoraId,
        enviarPorWhatsApp: Boolean(enviarPorWhatsApp),
      });

      return sendSuccess(res, data, "Mensaje de WhatsApp procesado");
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WhatsAppController();
