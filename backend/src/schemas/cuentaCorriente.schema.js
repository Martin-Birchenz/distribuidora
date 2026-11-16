const { z } = require("zod");

const registrarCobranzaSchema = z.object({
  cliente_comercio_id: z.coerce
    .number()
    .int()
    .positive("Comercio cliente requerido"),
  pedido_id: z.coerce.number().int().positive().nullable().optional(),
  metodo_pago: z.enum(["EFECTIVO", "TRANSFERENCIA", "CHEQUE", "OTRO"]),
  monto: z.coerce.number().positive("El monto del pago debe ser mayor a 0"),
  referencia_comprobante: z.string().max(120).trim().optional().nullable(),
  observaciones: z.string().max(255).trim().optional().nullable(),
});

module.exports = { registrarCobranzaSchema };
