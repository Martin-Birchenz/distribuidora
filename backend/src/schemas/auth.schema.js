const { z } = require("zod");

const loginSchema = z.object({
  email: z.string().email("Formato de email inválido").trim().toLowerCase(),
  password: z.string().min(4, "La contraseña es requerida"),
});

const portalComercioLoginSchema = z.object({
  identificador: z.string().min(3, "Ingresá tu CUIT o Email").trim(),
  pin: z.string().min(4, "Ingresá tu PIN o contraseña de acceso"),
});

module.exports = { loginSchema, portalComercioLoginSchema };
