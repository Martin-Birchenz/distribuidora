const { z } = require("zod");

const createDistribuidoraSchema = z.object({
  razon_social: z.string().min(2).max(150).trim(),
  nombre_fantasia: z.string().min(2).max(150).trim(),
  cuit: z.string().min(8).max(20).trim(),
  slug: z
    .string()
    .min(3)
    .max(80)
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9-]+$/,
      "El slug solo permite minúsculas, números y guiones",
    ),
  plan_type: z.enum(["CORE", "FULL"]).default("CORE"),
  has_web_portal: z.boolean().default(false),
  has_ai_addon: z.boolean().default(false),
  max_preventistas: z.coerce.number().int().min(1).default(2),
  // Branding inicial (Modo Camaleón)
  primary_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default("#1E3A8A"),
  secondary_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default("#0F172A"),
  accent_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default("#F59E0B"),
  whatsapp_pedidos: z.string().max(30).optional().nullable(),
  // Usuario Administrador inicial de la distribuidora
  admin_name: z.string().min(2).max(120).trim(),
  admin_email: z.string().email().trim().toLowerCase(),
  admin_password: z
    .string()
    .min(6, "La clave inicial debe tener al menos 6 caracteres"),
});

const updateDistribuidoraStatusSchema = z.object({
  is_active: z.boolean().optional(),
  plan_type: z.enum(["CORE", "FULL"]).optional(),
  has_web_portal: z.boolean().optional(),
  has_ai_addon: z.boolean().optional(),
  max_preventistas: z.coerce.number().int().min(1).optional(),
});

module.exports = { createDistribuidoraSchema, updateDistribuidoraStatusSchema };
