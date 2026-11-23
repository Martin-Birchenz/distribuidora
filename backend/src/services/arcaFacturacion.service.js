const crypto = require("crypto");
const { z } = require("zod");
const pool = require("../config/db");

const emitirLoteSchema = z.object({
  pedido_ids: z
    .array(z.number().int().positive())
    .min(1, "Seleccioná al menos un pedido"),
  punto_venta: z.number().int().positive().default(1),
});

class ArcaFacturacionService {
  /**
   * Emite en lote Facturas A (si el comercio tiene CUIT de 11 dígitos) o Facturas B (Consumidor Final / Monotributo sin CUIT)
   * Deja lista la estructura para invocar WSAA/WSFEv1 de ARCA cuando se carguen certificados .crt/.key.
   */
  async emitirLoteFacturas(distribuidoraId, payload) {
    const data = emitirLoteSchema.parse(payload);
    const connection = await pool.getConnection();
    const loteUuid = crypto.randomUUID();
    const emitidos = [];
    const errores = [];

    try {
      await connection.beginTransaction();

      // Obtener últimos números emitidos por tipo en este punto de venta
      const [ultimosRows] = await connection.query(
        `SELECT tipo_comprobante, COALESCE(MAX(numero_comprobante), 0) AS max_num
         FROM comprobantes_fiscales
         WHERE distribuidora_id = ? AND punto_venta = ?
         GROUP BY tipo_comprobante
         FOR UPDATE`,
        [distribuidoraId, data.punto_venta],
      );

      const correlativos = {
        FACTURA_A: 0,
        FACTURA_B: 0,
      };
      for (const r of ultimosRows) {
        correlativos[r.tipo_comprobante] = Number(r.max_num);
      }

      for (const pedidoId of data.pedido_ids) {
        // Verificar si ya fue facturado
        const [yaFacturado] = await connection.query(
          `SELECT id, tipo_comprobante, numero_comprobante, cae
           FROM comprobantes_fiscales
           WHERE distribuidora_id = ? AND pedido_id = ? AND estado = 'AUTORIZADO'
           LIMIT 1`,
          [distribuidoraId, pedidoId],
        );

        if (yaFacturado.length > 0) {
          errores.push({
            pedido_id: pedidoId,
            motivo: `Ya posee ${yaFacturado[0].tipo_comprobante} #${yaFacturado[0].numero_comprobante} (CAE ${yaFacturado[0].cae})`,
          });
          continue;
        }

        const [pedRows] = await connection.query(
          `SELECT p.id, p.numero_pedido, p.total, p.estado, p.cliente_comercio_id, p.guest_nombre,
                  c.razon_social, c.nombre_fantasia, c.cuit
           FROM pedidos p
           LEFT JOIN clientes_comercios c ON p.cliente_comercio_id = c.id
           WHERE p.id = ? AND p.distribuidora_id = ? AND p.deleted_at IS NULL
           FOR UPDATE`,
          [pedidoId, distribuidoraId],
        );

        if (pedRows.length === 0) {
          errores.push({ pedido_id: pedidoId, motivo: "Pedido no encontrado" });
          continue;
        }

        const ped = pedRows[0];
        if (["CANCELADO", "PENDIENTE_APROBACION"].includes(ped.estado)) {
          errores.push({
            pedido_id: pedidoId,
            numero_pedido: ped.numero_pedido,
            motivo: `Estado inválido para facturar (${ped.estado})`,
          });
          continue;
        }

        const cuitLimpio = (ped.cuit || "").replace(/\D/g, "");
        const esFacturaA = cuitLimpio.length === 11;
        const tipoComprobante = esFacturaA ? "FACTURA_A" : "FACTURA_B";

        correlativos[tipoComprobante] += 1;
        const nroComprobante = correlativos[tipoComprobante];

        const total = Number(ped.total);
        const neto = Number((total / 1.21).toFixed(2));
        const iva = Number((total - neto).toFixed(2));

        // Generación de CAE (14 dígitos) y vencimiento a +10 días (Hook listo para WSFEv1 FECAESolicitar)
        const cae = `76${Date.now().toString().slice(-10)}${String(nroComprobante).padStart(2, "0")}`;
        const vtoDate = new Date();
        vtoDate.setDate(vtoDate.getDate() + 10);
        const caeVencimiento = vtoDate.toISOString().slice(0, 10);

        const razonSocialReceptor =
          ped.razon_social ||
          ped.nombre_fantasia ||
          ped.guest_nombre ||
          "Consumidor Final";

        await connection.query(
          `INSERT INTO comprobantes_fiscales
           (distribuidora_id, pedido_id, cliente_comercio_id, punto_venta, tipo_comprobante, numero_comprobante,
            cuit_receptor, razon_social_receptor, importe_neto, importe_iva, importe_total, cae, cae_vencimiento, estado, lote_uuid)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AUTORIZADO', ?)`,
          [
            distribuidoraId,
            ped.id,
            ped.cliente_comercio_id || null,
            data.punto_venta,
            tipoComprobante,
            nroComprobante,
            esFacturaA ? cuitLimpio : null,
            razonSocialReceptor,
            neto,
            iva,
            total,
            cae,
            caeVencimiento,
            loteUuid,
          ],
        );

        emitidos.push({
          pedido_id: ped.id,
          numero_pedido: ped.numero_pedido,
          tipo_comprobante: tipoComprobante,
          comprobante_formateado: `${String(data.punto_venta).padStart(4, "0")}-${String(nroComprobante).padStart(8, "0")}`,
          receptor: razonSocialReceptor,
          total,
          cae,
          cae_vencimiento: caeVencimiento,
        });
      }

      await connection.commit();

      return {
        lote_uuid: loteUuid,
        total_emitidos: emitidos.length,
        total_rechazados: errores.length,
        emitidos,
        errores,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = new ArcaFacturacionService();
