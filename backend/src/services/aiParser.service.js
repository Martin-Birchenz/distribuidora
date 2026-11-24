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

const supplierPriceResponseSchema = z.object({
  sugerencias: z.array(
    z.object({
      producto_id: z.number().int().positive(),
      nuevo_costo: z.number().nonnegative(),
      nuevo_precio_mayorista: z.number().nonnegative(),
      motivo: z.string().default(""),
    }),
  ),
  no_encontrados: z.array(z.string()).default([]),
});

function traducirErrorIA(error) {
  const raw = String(error?.message || "");
  if (raw.includes("Timeout")) {
    return "La inteligencia artificial tardó demasiado en responder. Intentá de nuevo con un texto más corto.";
  }
  if (
    raw.includes("404") ||
    raw.includes("NOT_FOUND") ||
    raw.includes("no longer available")
  ) {
    return "El modelo de inteligencia artificial no está disponible en este momento. Avisá a soporte técnico.";
  }
  if (
    raw.includes("429") ||
    raw.includes("quota") ||
    raw.includes("RESOURCE_EXHAUSTED")
  ) {
    return "Se alcanzó el límite temporal de consultas de inteligencia artificial. Esperá un momento y probá de nuevo.";
  }
  if (raw.includes("GEMINI_API_KEY")) {
    return "Falta configurar la clave de inteligencia artificial en el servidor.";
  }
  return "No pudimos procesar la solicitud con inteligencia artificial. Intentá nuevamente.";
}

function conTimeout(promise, ms = 15000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function parsearJsonSeguro(rawText) {
  const texto = String(rawText || "").trim();
  if (!texto) {
    throw new Error("Respuesta vacía del modelo");
  }
  const sinMarkdown = texto
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(sinMarkdown);
}

class AiParserService {
  constructor() {
    this.ai = process.env.GEMINI_API_KEY
      ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
      : null;
  }

  async parsearPedidoTextoWhatsApp(distribuidoraId, texto = "") {
    if (!this.ai) {
      const err = new Error(traducirErrorIA({ message: "GEMINI_API_KEY" }));
      err.statusCode = 503;
      throw err;
    }

    const limpio = String(texto || "").trim();
    if (!limpio) {
      const err = new Error("Pegá el texto del pedido de WhatsApp primero.");
      err.statusCode = 400;
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
        "Primero cargá productos en tu catálogo para poder reconocer los pedidos.",
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
Sos un asistente de una distribuidora mayorista argentina.
Tu tarea es mapear un mensaje de texto de WhatsApp contra el CATÁLOGO OFICIAL.

REGLAS:
1. Solo devolvé "producto_id" que existan literalmente en el CATÁLOGO OFICIAL.
2. Si un pedido es ambiguo o coincide con varias presentaciones/marcas, agregalo en "items_ambiguos" explicando la duda.
3. Si piden algo que no está en el catálogo, agregalo en "items_ambiguos".
4. Convertí expresiones como "media docena" = 6, "un par" = 2, "tres cajones" = 3 a enteros positivos.

CATÁLOGO OFICIAL:
${catalogoCompacto}
`;

    try {
      const response = await conTimeout(
        this.ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: [
            {
              text: `Mensaje de WhatsApp del cliente:\n"${limpio}"`,
            },
          ],
          config: {
            systemInstruction,
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
        15000,
      );

      const parsedJson = aiResponseSchema.parse(
        parsearJsonSeguro(response.text),
      );
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
    } catch (error) {
      const err = new Error(traducirErrorIA(error));
      err.statusCode = error?.statusCode || 500;
      throw err;
    }
  }

  async sugerirActualizacionListaProveedor(
    distribuidoraId,
    listaTexto = "",
    margenPorcentaje = 20,
  ) {
    if (!this.ai) {
      const err = new Error(traducirErrorIA({ message: "GEMINI_API_KEY" }));
      err.statusCode = 503;
      throw err;
    }

    const limpio = String(listaTexto || "").trim();
    if (!limpio) {
      const err = new Error("Pegá la lista de precios del proveedor primero.");
      err.statusCode = 400;
      throw err;
    }

    const [productos] = await pool.query(
      `SELECT id, sku, nombre, marca, unidad_venta, costo_reposicion, precio_mayorista, precio_minorista, precio_especial
       FROM productos
       WHERE distribuidora_id = ? AND is_active = 1 AND deleted_at IS NULL`,
      [distribuidoraId],
    );

    if (productos.length === 0) {
      const err = new Error("No tenés productos cargados en tu catálogo.");
      err.statusCode = 400;
      throw err;
    }

    const catalogoActual = productos
      .map(
        (p) =>
          `ID:${p.id} | SKU:${p.sku} | ${p.nombre} [${p.unidad_venta}] | CostoActual:${p.costo_reposicion} | MayoristaActual:${p.precio_mayorista}`,
      )
      .join("\n");

    const margen = Math.max(0, Number(margenPorcentaje) || 0);

    const systemInstruction = `
Sos un asistente de compras para una distribuidora mayorista argentina.
Te darán una lista de precios enviada por un proveedor y el CATÁLOGO ACTUAL de la distribuidora.

Tu tarea es detectar qué productos coinciden y sugerir el nuevo costo y nuevo precio mayorista aplicando un margen de ${margen}% sobre el nuevo costo (redondeado a entero).

REGLAS:
1. Solo devolvé "producto_id" que existan literalmente en el CATÁLOGO ACTUAL.
2. Si un ítem de la lista del proveedor no coincide con seguridad con ningún producto, agregalo en "no_encontrados".
3. Los montos deben ser números positivos sin símbolos de moneda.

CATÁLOGO ACTUAL:
${catalogoActual}
`;

    try {
      const response = await conTimeout(
        this.ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: [
            {
              text: `Lista del proveedor:\n"""\n${limpio}\n"""`,
            },
          ],
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                sugerencias: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      producto_id: { type: Type.INTEGER },
                      nuevo_costo: { type: Type.NUMBER },
                      nuevo_precio_mayorista: { type: Type.NUMBER },
                      motivo: { type: Type.STRING },
                    },
                    required: [
                      "producto_id",
                      "nuevo_costo",
                      "nuevo_precio_mayorista",
                    ],
                  },
                },
                no_encontrados: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ["sugerencias", "no_encontrados"],
            },
          },
        }),
        15000,
      );

      const parsed = supplierPriceResponseSchema.parse(
        parsearJsonSeguro(response.text),
      );
      const prodMap = new Map(productos.map((p) => [p.id, p]));

      const sugerenciasEnriquecidas = (parsed.sugerencias || [])
        .map((s) => {
          const prod = prodMap.get(s.producto_id);
          if (!prod) return null;
          const costoActual = Number(prod.costo_reposicion || 0);
          const mayoristaActual = Number(prod.precio_mayorista || 0);
          const nuevoCosto = Math.round(Number(s.nuevo_costo));
          const nuevoMayorista = Math.round(Number(s.nuevo_precio_mayorista));

          const variacionPct =
            mayoristaActual > 0
              ? Number(
                  (
                    ((nuevoMayorista - mayoristaActual) / mayoristaActual) *
                    100
                  ).toFixed(1),
                )
              : 0;

          return {
            producto_id: prod.id,
            sku: prod.sku,
            nombre: prod.nombre,
            unidad_venta: prod.unidad_venta,
            costo_actual: costoActual,
            nuevo_costo: nuevoCosto,
            precio_mayorista_actual: mayoristaActual,
            nuevo_precio_mayorista: nuevoMayorista,
            variacion_pct: variacionPct,
            motivo: s.motivo || "Coincidencia detectada en lista de proveedor",
          };
        })
        .filter(Boolean);

      return {
        sugerencias: sugerenciasEnriquecidas,
        no_encontrados: parsed.no_encontrados || [],
      };
    } catch (error) {
      const err = new Error(traducirErrorIA(error));
      err.statusCode = error?.statusCode || 500;
      throw err;
    }
  }
}

module.exports = new AiParserService();
