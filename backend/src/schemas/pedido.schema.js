const { z } = require("zod");

const itemPedidoSchema = z.object({
  producto_id: z.coerce.number().int().positive("ID de producto inválido"),
  cantidad: z.coerce.number().int().positive("La cantidad debe ser al menos 1"),
});

const crearPedidoInternoSchema = z.object({
  cliente_comercio_id: z.coerce
    .number()
    .int()
    .positive("Seleccioná un comercio cliente"),
  lista_aplicada: z.enum(["MINORISTA", "MAYORISTA", "ESPECIAL"]),
  condicion_pago: z
    .enum(["CUENTA_CORRIENTE", "CONTADO_ENTREGA", "TRANSFERENCIA"])
    .default("CUENTA_CORRIENTE"),
  notas: z.string().max(1000).trim().optional().nullable(),
  fecha_entrega_estimada: z.string().optional().nullable(),
  items: z
    .array(itemPedidoSchema)
    .min(1, "El pedido debe tener al menos 1 producto"),
});

const crearPedidoPublicoSchema = z.object({
  lista_aplicada: z
    .enum(["MINORISTA", "MAYORISTA", "ESPECIAL"])
    .default("MINORISTA"),
  condicion_pago: z
    .enum(["CUENTA_CORRIENTE", "CONTADO_ENTREGA", "TRANSFERENCIA"])
    .default("CONTADO_ENTREGA"),
  guest_nombre: z.string().min(2).max(120).trim().optional().nullable(),
  guest_telefono: z.string().min(6).max(40).trim().optional().nullable(),
  guest_direccion: z.string().min(4).max(255).trim().optional().nullable(),
  notas: z.string().max(1000).trim().optional().nullable(),
  items: z.array(itemPedidoSchema).min(1, "El carrito está vacío"),
});

const cambiarEstadoPedidoSchema = z.object({
  estado: z.enum([
    "CONFIRMADO",
    "EN_PREPARACION",
    "DESPACHADO",
    "ENTREGADO",
    "CANCELADO",
  ]),
});

module.exports = {
  crearPedidoInternoSchema,
  crearPedidoPublicoSchema,
  cambiarEstadoPedidoSchema,
};
