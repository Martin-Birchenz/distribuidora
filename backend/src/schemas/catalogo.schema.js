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
  image_url: z.string().url().max(255).nullable().optional(),
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

// Esquema estricto para cada fila del Excel de importación
const excelProductoRowSchema = z.object({
  SKU: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length > 0, "SKU vacío"),
  Nombre: z
    .string({ required_error: "Nombre faltante" })
    .min(2, "Nombre muy corto")
    .max(180)
    .trim(),
  Categoria: z.string().max(100).trim().optional().default("General"),
  Unidad_Venta: z.string().max(40).trim().optional().default("Bulto"),
  Precio_Minorista: z.coerce
    .number({ invalid_type_error: "Precio Minorista debe ser numérico" })
    .nonnegative(),
  Precio_Mayorista: z.coerce
    .number({ invalid_type_error: "Precio Mayorista debe ser numérico" })
    .nonnegative(),
  Precio_Especial: z.coerce
    .number({ invalid_type_error: "Precio Especial debe ser numérico" })
    .nonnegative()
    .optional(),
  Stock_Inicial: z.coerce
    .number({ invalid_type_error: "Stock debe ser entero" })
    .int()
    .default(0),
});

module.exports = {
  createCategoriaSchema,
  createProductoSchema,
  updateProductoSchema,
  ajusteStockSchema,
  excelProductoRowSchema,
};
