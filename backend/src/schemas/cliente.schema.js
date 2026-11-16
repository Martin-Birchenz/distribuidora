const { z } = require("zod");

const createClienteSchema = z.object({
  codigo_interno: z.string().max(40).trim().nullable().optional(),
  nombre_fantasia: z
    .string()
    .min(2, "Nombre del comercio requerido")
    .max(150)
    .trim(),
  razon_social: z.string().max(150).trim().nullable().optional(),
  cuit: z.string().max(20).trim().nullable().optional(),
  telefono: z.string().max(40).trim().nullable().optional(),
  direccion: z.string().min(3, "Dirección requerida").max(255).trim(),
  zona_reparto: z.string().max(80).trim().nullable().optional(),
  lista_precio_default: z
    .enum(["MINORISTA", "MAYORISTA", "ESPECIAL"])
    .default("MAYORISTA"),
  credit_limit: z.coerce.number().nonnegative().default(0),
  saldo_inicial: z.coerce.number().default(0),
  web_access_enabled: z.boolean().default(false),
  web_pin: z.string().min(4).max(20).optional().nullable(),
});

const updateClienteSchema = createClienteSchema
  .omit({ saldo_inicial: true })
  .partial()
  .extend({
    is_active: z.boolean().optional(),
  });

module.exports = { createClienteSchema, updateClienteSchema };
