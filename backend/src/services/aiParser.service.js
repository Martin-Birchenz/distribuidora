const { GoogleGenAI, Type } = require("@google/genai");
const { z } = require("zod");
const pool = require("../config/db");

const aiResponseSchema = z.object({
  items_identificados: z.array(
    z.object({
      producto_id: z.number().int().positive(),
      cantidad: z.number().int().positive(),
    }),
  ),
  items_ambiguos: z.array(z.string()).default([]),
});

class AiParserService {
  constructor() {
    this.ai = process.env.GEMINI_API_KEY
      ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
      : null;
  }

  async parsearPedidoWhatsApp(
    distribuidoraId,
    { texto = "", audioFile = null },
  ) {
    if (!this.ai) {
      const err = new Error("GEMINI_API_KEY no configurada en Render");
      err.statusCode = 503;
      throw err;
    }

    const [distRows] = await pool.query(
      "SELECT has_ai_addon FROM distribuidoras WHERE id = ? LIMIT 1",
      [distribuidoraId],
    );
    if (!distRows[0]?.has_ai_addon) {
      const err = new Error(
        "El Add-on de IA para WhatsApp no está habilitado en este plan",
      );
      err.statusCode = 403;
      throw err;
    }

    const [productos] = await pool.query(
      `SELECT id, sku, nombre, marca, unidad_venta, precio_mayorista, precio_minorista, precio_especial, stock_actual
       FROM productos
       WHERE distribuidora_id = ? AND is_active = 1 AND deleted_at IS NULL`,
      [distribuidoraId],
    );

    if (productos.length === 0) {
      const err = new Error(
        "No hay productos cargados en el catálogo para mapear el pedido",
      );
      err.statusCode = 400;
      throw err;
    }

    const catalogoCompacto = productos
      .map(
        (p) =>
          `ID:${p.id} | SKU:${p.sku} | ${p.nombre} (${p.marca || ""}) [${p.unidad_venta}]`,
      )
      .join("\n");

    const systemInstruction = `
Sos un parser de pedidos mayoristas de una distribuidora argentina.
Tu única tarea es mapear el mensaje o audio del cliente contra el CATÁLOGO OFICIAL provisto abajo.

REGLAS ESTRICTAS:
1. Solo podés devolver "producto_id" que existan literalmente en el CATÁLOGO OFICIAL.
2. Si el cliente pide un producto genérico que coincide con 2 o más variantes, agregalo en "items_ambiguos" explicando la duda.
3. Si pide algo que no existe en el catálogo, agregalo en "items_ambiguos".
4. Convertí expresiones coloquiales ("media docena" = 6, "un par" = 2, "tres cajones" = 3) a enteros positivos.

CATÁLOGO OFICIAL:
${catalogoCompacto}
`;

    const contents = [];
    if (audioFile) {
      contents.push({
        inlineData: {
          mimeType: audioFile.mimetype || "audio/ogg",
          data: audioFile.buffer.toString("base64"),
        },
      });
      contents.push({
        text: "Transcribí este audio de pedido de WhatsApp y extraé los ítems exactos del catálogo.",
      });
    } else {
      contents.push({
        text: `Mensaje de pedido recibido por WhatsApp:\n"${texto}"`,
      });
    }

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Timeout al procesar pedido con IA")),
        20000,
      ),
    );

    const response = await Promise.race([
      this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: {
          systemInstruction,
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
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
            required: ["items_identificados", "items_ambiguos"],
          },
        },
      }),
      timeoutPromise,
    ]);

    const parsedJson = aiResponseSchema.parse(JSON.parse(response.text));

    const prodMap = new Map(productos.map((p) => [p.id, p]));
    const itemsHidratados = [];

    for (const item of parsedJson.items_identificados) {
      const prod = prodMap.get(item.producto_id);
      if (!prod) continue;
      itemsHidratados.push({
        producto_id: prod.id,
        sku: prod.sku,
        nombre: prod.nombre,
        unidad_venta: prod.unidad_venta,
        cantidad: item.cantidad,
        stock_actual: prod.stock_actual,
        precio_mayorista: Number(prod.precio_mayorista),
        precio_minorista: Number(prod.precio_minorista),
        precio_especial: Number(prod.precio_especial),
        sin_stock_suficiente: prod.stock_actual < item.cantidad,
      });
    }

    return {
      items_listos: itemsHidratados,
      items_ambiguos: parsedJson.items_ambiguos,
    };
  }
}

module.exports = new AiParserService();
