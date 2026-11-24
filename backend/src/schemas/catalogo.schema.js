const { z } = require("zod");

const createCategoriaSchema = z.object({
  nombre: z.string().min(2, "El nombre es obligatorio").max(100).trim(),
  orden: z.coerce.number().int().default(0),
});

const createProductoSchema = z.object({
  categoria_id: z.coerce.number().int().positive().nullable().optional(),
  sku: z.string().min(1, "El SKU es obligatorio").max(60).trim(),
  nombre: z.string().min(2, "El nombre es obligatorio").max(180).trim(),
  marca: z.string().max(100).trim().nullable().optional(),
  unidad_venta: z.string().min(1).max(40).trim().default("Bulto"),
  image_url: z.string().url().max(255).nullable().optional().or(z.literal("")),
  precio_minorista: z.coerce.number().nonnegative(),
  precio_mayorista: z.coerce.number().nonnegative(),
  precio_especial: z.coerce.number().nonnegative(),
  costo_reposicion: z.coerce.number().nonnegative().default(0),
  stock_actual: z.coerce.number().int().default(0),
  stock_minimo: z.coerce.number().int().nonnegative().default(5),
  visible_en_web: z.boolean().default(true),
});

const updateProductoSchema = createProductoSchema.partial().extend({
  is_active: z.boolean().optional(),
});

const ajusteStockSchema = z.object({
  cantidad: z.coerce
    .number()
    .int()
    .refine((val) => val !== 0, "La cantidad no puede ser 0"),
  motivo: z.string().min(2).max(150).trim().optional(),
});

function parseNumeroFlexible(val, fallback = 0) {
  if (val === null || val === undefined || val === "") return fallback;
  if (typeof val === "number") return Number.isFinite(val) ? val : fallback;
  let s = String(val)
    .replace(/[$a-zA-Z\s]/g, "")
    .trim();
  if (!s) return fallback;
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

function pickCol(row, aliases) {
  const normalizedEntries = Object.entries(row).map(([k, v]) => [
    String(k)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, ""),
    v,
  ]);
  for (const alias of aliases) {
    const cleanAlias = alias
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
    const found = normalizedEntries.find(([k]) => k === cleanAlias);
    if (found && found[1] !== undefined && String(found[1]).trim() !== "") {
      return found[1];
    }
  }
  return undefined;
}

const excelProductoRowSchema = z.preprocess(
  (rawRow) => {
    if (!rawRow || typeof rawRow !== "object") return rawRow;

    const mayorista = parseNumeroFlexible(
      pickCol(rawRow, [
        "precio_mayorista",
        "mayorista",
        "preciocomercio",
        "comercio",
        "lista2",
        "precio2",
        "precio",
      ]),
      0,
    );
    const minorista = parseNumeroFlexible(
      pickCol(rawRow, [
        "precio_minorista",
        "minorista",
        "preciopublico",
        "publico",
        "lista1",
        "precio1",
      ]),
      mayorista,
    );
    const especial = parseNumeroFlexible(
      pickCol(rawRow, [
        "precio_especial",
        "especial",
        "preciodistribuidor",
        "lista3",
        "precio3",
      ]),
      mayorista,
    );
    const stockRaw = parseNumeroFlexible(
      pickCol(rawRow, [
        "stock_inicial",
        "stock",
        "stock_actual",
        "stockactual",
        "stockinicial",
        "cantidad",
        "cant",
        "existencia",
        "existencias",
        "disponible",
        "bultos",
        "unidades",
      ]),
      0,
    );

    return {
      SKU: pickCol(rawRow, [
        "sku",
        "codigo",
        "cod",
        "codigoproducto",
        "id",
        "articulo_id",
      ]),
      Nombre: pickCol(rawRow, [
        "nombre",
        "producto",
        "articulo",
        "descripcion",
        "detalle",
        "item",
      ]),
      Marca: pickCol(rawRow, ["marca", "laboratorio", "fabricante", "linea"]),
      Categoria:
        pickCol(rawRow, [
          "categoria",
          "rubro",
          "familia",
          "seccion",
          "grupo",
        ]) || "General",
      Unidad_Venta:
        pickCol(rawRow, [
          "unidad_venta",
          "unidad",
          "presentacion",
          "bulto",
          "empaque",
          "pack",
        ]) || "Bulto",
      Costo_Reposicion: parseNumeroFlexible(
        pickCol(rawRow, ["costo", "costo_reposicion", "preciocosto", "compra"]),
        0,
      ),
      Precio_Minorista: minorista,
      Precio_Mayorista: mayorista,
      Precio_Especial: especial,
      Stock_Inicial: Math.round(stockRaw),
    };
  },
  z.object({
    SKU: z
      .union([z.string(), z.number()])
      .transform((v) => String(v).trim())
      .refine((v) => v.length > 0, "Falta el código o SKU del producto"),
    Nombre: z
      .union([z.string(), z.number()])
      .transform((v) => String(v).trim())
      .refine((v) => v.length >= 2, "Falta el nombre del producto"),
    Marca: z.string().max(100).trim().optional().nullable(),
    Categoria: z.string().max(100).trim().default("General"),
    Unidad_Venta: z.string().max(40).trim().default("Bulto"),
    Costo_Reposicion: z.number().nonnegative().default(0),
    Precio_Minorista: z.number().nonnegative().default(0),
    Precio_Mayorista: z.number().nonnegative().default(0),
    Precio_Especial: z.number().nonnegative().optional(),
    Stock_Inicial: z.number().int().default(0),
  }),
);

module.exports = {
  createCategoriaSchema,
  createProductoSchema,
  updateProductoSchema,
  ajusteStockSchema,
  excelProductoRowSchema,
};
