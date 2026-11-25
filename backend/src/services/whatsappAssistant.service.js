const { GoogleGenAI, Type } = require("@google/genai");
const { z } = require("zod");
const pool = require("../config/db");
const pedidoService = require("./pedido.service");

const PRECIO_COL_MAP = {
  MINORISTA: "precio_minorista",
  MAYORISTA: "precio_mayorista",
  ESPECIAL: "precio_especial",
};

const aiPedidoSchema = z.object({
  items_identificados: z.array(
    z.object({
      producto_id: z.number().int().positive(),
      cantidad: z.number().int().positive(),
    }),
  ),
  items_ambiguos: z.array(z.string()).default([]),
  intencion: z
    .enum(["PEDIDO", "CONFIRMAR", "CANCELAR", "CONSULTA"])
    .default("PEDIDO"),
});

function normalizarTelefono(raw = "") {
  return String(raw || "").replace(/\D/g, "");
}

function conTimeout(promise, ms = 30000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function parsearJsonSeguro(rawText) {
  const texto = String(rawText || "").trim();
  if (!texto) throw new Error("Respuesta vacía del modelo");
  const limpio = texto
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(limpio);
}

function formatearMoneda(valor) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(Number(valor || 0));
}

class WhatsAppAssistantService {
  constructor() {
    this.ai = process.env.GEMINI_API_KEY
      ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
      : null;

    // Carritos pendientes de confirmación: key = `${distribuidoraId}:${telefonoNormalizado}`
    this.pendingCarts = new Map();
    this.ttlMs = 30 * 60 * 1000; // 30 minutos
  }

  getCartKey(distribuidoraId, telefono) {
    return `${distribuidoraId || "default"}:${normalizarTelefono(telefono)}`;
  }

  obtenerCarritoPendiente(distribuidoraId, telefono) {
    const key = this.getCartKey(distribuidoraId, telefono);
    const entry = this.pendingCarts.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.pendingCarts.delete(key);
      return null;
    }
    return entry.cart;
  }

  guardarCarritoPendiente(distribuidoraId, telefono, cart) {
    const key = this.getCartKey(distribuidoraId, telefono);
    this.pendingCarts.set(key, {
      cart,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  limpiarCarritoPendiente(distribuidoraId, telefono) {
    const key = this.getCartKey(distribuidoraId, telefono);
    this.pendingCarts.delete(key);
  }

  async resolverDistribuidoraYCliente(
    telefono,
    phoneNumberId = null,
    distribuidoraIdForzada = null,
  ) {
    const telLimpio = normalizarTelefono(telefono);

    let distribuidoraId = distribuidoraIdForzada
      ? Number(distribuidoraIdForzada)
      : null;

    if (
      !distribuidoraId &&
      phoneNumberId &&
      process.env.WHATSAPP_PHONE_NUMBER_MAP
    ) {
      try {
        const mapa = JSON.parse(process.env.WHATSAPP_PHONE_NUMBER_MAP);
        if (mapa[phoneNumberId]) {
          distribuidoraId = Number(mapa[phoneNumberId]);
        }
      } catch (_) {
        // Ignorar JSON inválido en variable de entorno opcional
      }
    }

    if (!distribuidoraId && process.env.DEFAULT_DISTRIBUIDORA_ID) {
      distribuidoraId = Number(process.env.DEFAULT_DISTRIBUIDORA_ID);
    }

    let cliente = null;
    if (telLimpio) {
      const ultimos8 = telLimpio.slice(-8);
      const [rows] = await pool.query(
        `SELECT id, distribuidora_id, nombre_fantasia, telefono, lista_precio_default, credit_limit, current_balance, is_active
         FROM clientes_comercios
         WHERE is_active = 1
           AND deleted_at IS NULL
           ${distribuidoraId ? "AND distribuidora_id = ?" : ""}
           AND REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(telefono, ''), '+', ''), '-', ''), ' ', ''), '(', '') LIKE ?
         LIMIT 1`,
        distribuidoraId ? [distribuidoraId, `%${ultimos8}`] : [`%${ultimos8}`],
      );
      if (rows.length > 0) {
        cliente = rows[0];
        distribuidoraId = Number(cliente.distribuidora_id);
      }
    }

    if (!distribuidoraId) {
      const err = new Error(
        "No se pudo identificar la distribuidora de este número de WhatsApp.",
      );
      err.statusCode = 400;
      throw err;
    }

    const listaAplicada = cliente?.lista_precio_default || "MINORISTA";

    return {
      distribuidoraId,
      cliente,
      listaAplicada,
      telefonoNormalizado: telLimpio,
    };
  }

  async descargarAudioWhatsApp(mediaId, accessToken = null) {
    const token = accessToken || process.env.WHATSAPP_TOKEN;
    if (!token) {
      throw new Error(
        "Falta WHATSAPP_TOKEN para descargar el audio de WhatsApp.",
      );
    }

    const metaRes = await conTimeout(
      fetch(
        `[https://graph.facebook.com/v21.0/$](https://graph.facebook.com/v21.0/$){mediaId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      ),
      15000,
    );
    if (!metaRes.ok) {
      throw new Error(
        `Error al consultar metadata de audio (${metaRes.status})`,
      );
    }
    const metaJson = await metaRes.json();
    if (!metaJson.url) {
      throw new Error("No se obtuvo URL de descarga para el audio.");
    }

    const binRes = await conTimeout(
      fetch(metaJson.url, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      20000,
    );
    if (!binRes.ok) {
      throw new Error(`Error al descargar binario de audio (${binRes.status})`);
    }

    const arrayBuffer = await binRes.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: metaJson.mime_type || "audio/ogg",
    };
  }

  async enviarMensajeWhatsApp(to, body, config = {}) {
    const token = config.whatsappToken || process.env.WHATSAPP_TOKEN;
    const phoneNumberId =
      config.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      return {
        enviado: false,
        motivo: "WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID no configurados",
        texto: body,
      };
    }

    const destino = normalizarTelefono(to);
    const res = await conTimeout(
      fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: destino,
          type: "text",
          text: { body },
        }),
      }),
      15000,
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        data?.error?.message || `Error enviando WhatsApp (${res.status})`,
      );
    }

    return {
      enviado: true,
      messageId: data?.messages?.[0]?.id || null,
      texto: body,
    };
  }

  formatearResumenCarrito(cart, cliente) {
    const saludoCliente = cliente
      ? `*${cliente.nombre_fantasia}* (Lista ${cart.lista_aplicada})`
      : `Cliente WhatsApp (Lista ${cart.lista_aplicada})`;

    const lineasItems = cart.items.map((item, idx) => {
      const alertaStock = item.sin_stock_suficiente
        ? ` ⚠️ _Stock disponible: ${item.stock_actual} ${item.unidad_venta}_`
        : "";
      return `${idx + 1}. *${item.nombre}* (${item.unidad_venta}) — Cant: *${item.cantidad}* x ${formatearMoneda(item.precio_unitario)} = *${formatearMoneda(item.subtotal)}*${alertaStock}`;
    });

    const lineasAmbiguos =
      cart.items_ambiguos && cart.items_ambiguos.length > 0
        ? [
            "",
            "⚠️ *Ítems a revisar / no incluidos aún:*",
            ...cart.items_ambiguos.map((amb) => `• ${amb}`),
          ]
        : [];

    const lineasBloqueo = cart.tiene_sin_stock
      ? [
          "",
          "❗ Hay ítems sin stock suficiente. Respondé *CANCELAR* o indicá una cantidad menor.",
        ]
      : [
          "",
          "¿Confirmamos este pedido?",
          "Respondé *CONFIRMAR* para registrarlo o *CANCELAR* para descartarlo.",
        ];

    return [
      `🛒 *Carrito Armado — ${saludoCliente}*`,
      "",
      ...lineasItems,
      ...lineasAmbiguos,
      "",
      `💰 *Total estimado:* *${formatearMoneda(cart.total)}*`,
      ...lineasBloqueo,
    ].join("\n");
  }

  async interpretarConIA({
    distribuidoraId,
    listaAplicada,
    texto = "",
    audioBase64 = null,
    audioMimeType = "audio/ogg",
    tieneCarritoPendiente = false,
  }) {
    if (!this.ai) {
      const err = new Error("Falta configurar GEMINI_API_KEY en el servidor.");
      err.statusCode = 503;
      throw err;
    }

    const colPrecio = PRECIO_COL_MAP[listaAplicada] || "precio_minorista";

    const [productos] = await pool.query(
      `SELECT id, sku, nombre, marca, unidad_venta, stock_actual, ${colPrecio} AS precio_unitario
       FROM productos
       WHERE distribuidora_id = ? AND is_active = 1 AND deleted_at IS NULL`,
      [distribuidoraId],
    );

    if (productos.length === 0) {
      const err = new Error(
        "No hay productos activos en el catálogo de esta distribuidora.",
      );
      err.statusCode = 400;
      throw err;
    }

    const catalogoTexto = productos
      .map(
        (p) =>
          `ID:${p.id} | SKU:${p.sku} | ${p.nombre} | Marca:${p.marca || "-"} | Presentacion:${p.unidad_venta} | Stock:${p.stock_actual} | Precio:${Number(p.precio_unitario)}`,
      )
      .join("\n");

    const systemInstruction = `
Sos un asistente de ventas mayoristas/minoristas por WhatsApp en Argentina.
Analizá el mensaje (texto o audio) del cliente y cruzalo contra el CATÁLOGO REAL.

REGLAS:
1. Detectá intención:
   - "CONFIRMAR" si el cliente confirma un carrito pendiente (ej: "confirmar", "confirmo", "dale", "sí", "ok", "mandalo", "listo").
   - "CANCELAR" si el cliente cancela o rechaza el carrito (ej: "cancelar", "no", "dejalo", "anular").
   - "PEDIDO" si pide productos, cantidades o variantes.
   - "CONSULTA" si solo saluda o pregunta sin pedir productos.
2. Solo devolvé "producto_id" que existan exactamente en el CATÁLOGO REAL.
3. Identificá cantidades y variantes/presentaciones (ej: pack, bulto, cajón, unidad, tamaño/sabor). Convertí "media docena" = 6, "una docena" = 12.
4. Si un producto es ambiguo, tiene varias variantes sin aclarar o no existe en el catálogo, agregá una descripción clara en "items_ambiguos".
5. ${tieneCarritoPendiente ? "El cliente ya tiene un carrito pendiente de confirmación." : "No hay carrito pendiente previo."}

CATÁLOGO REAL:
${catalogoTexto}
`;

    const parts = [];
    if (audioBase64) {
      parts.push({
        inlineData: {
          mimeType: audioMimeType || "audio/ogg",
          data: audioBase64,
        },
      });
    }
    parts.push({
      text: texto
        ? `Mensaje de WhatsApp del cliente:\n"${texto}"`
        : "Escuchá el audio del cliente y extraé el pedido.",
    });

    let response;

    try {
      response = await conTimeout(
        this.ai.models.generateContent({
          model: "gemini-2.5-flash-lite",
          contents: [{ role: "user", parts }],
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                intencion: {
                  type: Type.STRING,
                  enum: ["PEDIDO", "CONFIRMAR", "CANCELAR", "CONSULTA"],
                },
                items_identificados: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      producto_id: { type: Type.INTEGER },
                      cantidad: { type: Type.INTEGER },
                    },
                    required: ["producto_id", "cantidad"],
                  },
                },
                items_ambiguos: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ["intencion", "items_identificados", "items_ambiguos"],
            },
          },
        }),
        30000,
      );
    } catch (error) {
      console.error("[GEMINI ERROR]", error.status, error.message);

      const err = new Error(
        error.status === 429
          ? "El asistente alcanzó el límite de consultas. Intentá nuevamente más tarde."
          : "No se pudo procesar el mensaje. Intentá nuevamente.",
      );

      err.statusCode = error.status === 429 ? 429 : 503;
      throw err;
    }

    const parsed = aiPedidoSchema.parse(parsearJsonSeguro(response.text));
    const prodMap = new Map(productos.map((p) => [Number(p.id), p]));

    const items = [];
    let total = 0;
    let tieneSinStock = false;

    for (const rawItem of parsed.items_identificados) {
      const prod = prodMap.get(Number(rawItem.producto_id));
      if (!prod) continue;
      const cantidad = Number(rawItem.cantidad);
      const precioUnitario = Number(prod.precio_unitario);
      const subtotal = Number((precioUnitario * cantidad).toFixed(2));
      const sinStock = Number(prod.stock_actual) < cantidad;
      if (sinStock) tieneSinStock = true;
      total = Number((total + subtotal).toFixed(2));

      items.push({
        producto_id: Number(prod.id),
        sku: prod.sku,
        nombre: prod.nombre,
        marca: prod.marca || "",
        unidad_venta: prod.unidad_venta,
        cantidad,
        stock_actual: Number(prod.stock_actual),
        precio_unitario: precioUnitario,
        subtotal,
        sin_stock_suficiente: sinStock,
      });
    }

    return {
      intencion: parsed.intencion,
      items,
      items_ambiguos: parsed.items_ambiguos,
      total,
      tiene_sin_stock: tieneSinStock,
    };
  }

  async procesarMensajeEntrante({
    telefono,
    texto = "",
    audioBase64 = null,
    audioMimeType = "audio/ogg",
    phoneNumberId = null,
    distribuidoraIdForzada = null,
    enviarPorWhatsApp = true,
  }) {
    const contexto = await this.resolverDistribuidoraYCliente(
      telefono,
      phoneNumberId,
      distribuidoraIdForzada,
    );

    const { distribuidoraId, cliente, listaAplicada, telefonoNormalizado } =
      contexto;

    const textoLimpio = String(texto || "").trim();
    const upperTexto = textoLimpio.toUpperCase();

    const carritoPendiente = this.obtenerCarritoPendiente(
      distribuidoraId,
      telefonoNormalizado,
    );

    const saludosSimples = [
      "HOLA",
      "BUENAS",
      "BUEN DIA",
      "BUEN DÍA",
      "BUENAS TARDES",
      "BUENAS NOCHES",
      "QUE TAL",
      "QUÉ TAL",
      "HOLA!",
      "BUENAS!",
    ];

    if (
      !carritoPendiente &&
      !audioBase64 &&
      saludosSimples.includes(upperTexto.replace(/[!¡?.]/g, ""))
    ) {
      const msgSaludo = cliente
        ? `Hola *${cliente.nombre_fantasia}*! Mandame un texto o audio con los productos y cantidades que necesitás y te armo el carrito para confirmar.`
        : "¡Hola! Mandame un texto o audio con los productos y cantidades que querés pedir y te preparo el detalle con el total para confirmar.";

      const envio = enviarPorWhatsApp
        ? await this.enviarMensajeWhatsApp(telefonoNormalizado, msgSaludo)
        : { enviado: false, texto: msgSaludo };

      return {
        estado: "CONSULTA",
        carrito_pendiente: null,
        respuesta_whatsapp: msgSaludo,
        envio_whatsapp: envio,
      };
    }

    const palabrasConfirmar = [
      "CONFIRMAR",
      "CONFIRMO",
      "SI",
      "SÍ",
      "OK",
      "DALE",
      "LISTO",
      "MANDALO",
      "ACEPTO",
    ];
    const palabrasCancelar = ["CANCELAR", "CANCELO", "NO", "ANULAR", "DEJALO"];

    let intencion = "PEDIDO";
    if (
      carritoPendiente &&
      palabrasConfirmar.includes(upperTexto.replace(/[!¡.]/g, ""))
    ) {
      intencion = "CONFIRMAR";
    } else if (
      carritoPendiente &&
      palabrasCancelar.includes(upperTexto.replace(/[!¡.]/g, ""))
    ) {
      intencion = "CANCELAR";
    } else {
      const iaResult = await this.interpretarConIA({
        distribuidoraId,
        listaAplicada,
        texto: textoLimpio,
        audioBase64,
        audioMimeType,
        tieneCarritoPendiente: Boolean(carritoPendiente),
      });

      intencion = iaResult.intencion;

      if (intencion === "CONFIRMAR" && carritoPendiente) {
        return await this.confirmarCarritoPendiente({
          distribuidoraId,
          telefono: telefonoNormalizado,
          cliente,
          cart: carritoPendiente,
          enviarPorWhatsApp,
        });
      }

      if (intencion === "CANCELAR" && carritoPendiente) {
        this.limpiarCarritoPendiente(distribuidoraId, telefonoNormalizado);
        const msgCancel =
          "🗑️ Carrito cancelado. Cuando quieras armar un nuevo pedido, mandame un texto o audio.";
        const envio = enviarPorWhatsApp
          ? await this.enviarMensajeWhatsApp(telefonoNormalizado, msgCancel)
          : { enviado: false, texto: msgCancel };

        return {
          estado: "CANCELADO",
          carrito_pendiente: null,
          respuesta_whatsapp: msgCancel,
          envio_whatsapp: envio,
        };
      }

      if (intencion === "CONSULTA" && iaResult.items.length === 0) {
        const msgConsulta = cliente
          ? `Hola *${cliente.nombre_fantasia}*! Mandame un mensaje de texto o un audio con los productos y cantidades que necesitás y te armo el carrito para confirmar.`
          : "¡Hola! Mandame un texto o audio con los productos y cantidades que querés pedir y te preparo el detalle con el total para confirmar.";
        const envio = enviarPorWhatsApp
          ? await this.enviarMensajeWhatsApp(telefonoNormalizado, msgConsulta)
          : { enviado: false, texto: msgConsulta };

        return {
          estado: "CONSULTA",
          carrito_pendiente: carritoPendiente || null,
          respuesta_whatsapp: msgConsulta,
          envio_whatsapp: envio,
        };
      }

      const nuevoCart = {
        distribuidora_id: distribuidoraId,
        cliente_comercio_id: cliente ? Number(cliente.id) : null,
        cliente_nombre: cliente ? cliente.nombre_fantasia : "Cliente WhatsApp",
        telefono: telefonoNormalizado,
        lista_aplicada: listaAplicada,
        condicion_pago: cliente ? "CUENTA_CORRIENTE" : "CONTADO_ENTREGA",
        items: iaResult.items,
        items_ambiguos: iaResult.items_ambiguos,
        total: iaResult.total,
        tiene_sin_stock: iaResult.tiene_sin_stock,
        creado_en: new Date().toISOString(),
      };

      if (nuevoCart.items.length === 0) {
        const msgSinItems = [
          "No pude identificar productos válidos de nuestro catálogo en tu mensaje.",
          ...(nuevoCart.items_ambiguos || []).map((a) => `• ${a}`),
          "Probá indicando producto, presentación/variante y cantidad.",
        ].join("\n");

        const envio = enviarPorWhatsApp
          ? await this.enviarMensajeWhatsApp(telefonoNormalizado, msgSinItems)
          : { enviado: false, texto: msgSinItems };

        return {
          estado: "SIN_ITEMS_RECONOCIDOS",
          carrito_pendiente: null,
          respuesta_whatsapp: msgSinItems,
          envio_whatsapp: envio,
        };
      }

      this.guardarCarritoPendiente(
        distribuidoraId,
        telefonoNormalizado,
        nuevoCart,
      );

      const resumenTexto = this.formatearResumenCarrito(nuevoCart, cliente);
      const envio = enviarPorWhatsApp
        ? await this.enviarMensajeWhatsApp(telefonoNormalizado, resumenTexto)
        : { enviado: false, texto: resumenTexto };

      return {
        estado: "PENDIENTE_CONFIRMACION",
        carrito_pendiente: nuevoCart,
        respuesta_whatsapp: resumenTexto,
        envio_whatsapp: envio,
      };
    }

    if (intencion === "CONFIRMAR") {
      return await this.confirmarCarritoPendiente({
        distribuidoraId,
        telefono: telefonoNormalizado,
        cliente,
        cart: carritoPendiente,
        enviarPorWhatsApp,
      });
    }

    this.limpiarCarritoPendiente(distribuidoraId, telefonoNormalizado);
    const msgCancel =
      "🗑️ Carrito cancelado. Cuando quieras armar un nuevo pedido, mandame un texto o audio.";
    const envio = enviarPorWhatsApp
      ? await this.enviarMensajeWhatsApp(telefonoNormalizado, msgCancel)
      : { enviado: false, texto: msgCancel };

    return {
      estado: "CANCELADO",
      carrito_pendiente: null,
      respuesta_whatsapp: msgCancel,
      envio_whatsapp: envio,
    };
  }

  async confirmarCarritoPendiente({
    distribuidoraId,
    telefono,
    cliente,
    cart,
    enviarPorWhatsApp = true,
  }) {
    if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
      const msgNoCart =
        "No tenés ningún carrito pendiente de confirmación. Enviá un texto o audio con tu pedido para armarlo.";
      const envio = enviarPorWhatsApp
        ? await this.enviarMensajeWhatsApp(telefono, msgNoCart)
        : { enviado: false, texto: msgNoCart };
      return {
        estado: "SIN_CARRITO_PENDIENTE",
        respuesta_whatsapp: msgNoCart,
        envio_whatsapp: envio,
      };
    }

    const payloadPedido = {
      cliente_comercio_id: cart.cliente_comercio_id || null,
      lista_aplicada: cart.lista_aplicada || "MINORISTA",
      condicion_pago: cart.condicion_pago || "CONTADO_ENTREGA",
      guest_nombre: cart.cliente_comercio_id ? null : cart.cliente_nombre,
      guest_telefono: cart.cliente_comercio_id ? null : telefono,
      guest_direccion: null,
      notas: `Pedido confirmado por WhatsApp (${telefono})`,
      origen: cart.cliente_comercio_id ? "WEB_B2B" : "WEB_MINORISTA",
      items: cart.items.map((it) => ({
        producto_id: Number(it.producto_id),
        cantidad: Number(it.cantidad),
      })),
    };

    const pedidoCreado = await pedidoService.crearPedidoTransaccional({
      distribuidoraId,
      userId: null,
      userRole: null,
      payload: payloadPedido,
    });

    this.limpiarCarritoPendiente(distribuidoraId, telefono);

    const avisoAprobacion = pedidoCreado.requiereAprobacionCredito
      ? "\n⏳ *Nota:* El pedido quedó en estado *PENDIENTE_APROBACION* por límite de crédito y será revisado por administración."
      : "";

    const msgConfirmado = [
      `✅ *¡Pedido Confirmado y Registrado!*`,
      `📄 *Número:* ${pedidoCreado.numeroPedido}`,
      `💰 *Total:* *${formatearMoneda(pedidoCreado.total)}*`,
      `📌 *Estado:* ${pedidoCreado.estado}${avisoAprobacion}`,
    ].join("\n");

    const envio = enviarPorWhatsApp
      ? await this.enviarMensajeWhatsApp(telefono, msgConfirmado)
      : { enviado: false, texto: msgConfirmado };

    return {
      estado: "CONFIRMADO_Y_REGISTRADO",
      pedido: pedidoCreado,
      respuesta_whatsapp: msgConfirmado,
      envio_whatsapp: envio,
    };
  }
}

module.exports = new WhatsAppAssistantService();
