const PDFDocument = require("pdfkit");
const pool = require("../config/db");

class RemitoPdfService {
  async generarRemitoBuffer(distribuidoraId, pedidoId, formato = "a4") {
    // 1. Obtener datos de la distribuidora y del pedido
    const [distRows] = await pool.query(
      `SELECT d.razon_social, d.nombre_fantasia, d.cuit, s.whatsapp_pedidos
       FROM distribuidoras d
       LEFT JOIN distribuidora_settings s ON d.id = s.distribuidora_id
       WHERE d.id = ? LIMIT 1`,
      [distribuidoraId],
    );

    if (distRows.length === 0) {
      const err = new Error("Distribuidora no encontrada");
      err.statusCode = 404;
      throw err;
    }

    const [pedRows] = await pool.query(
      `SELECT p.*,
              COALESCE(c.nombre_fantasia, p.guest_nombre) AS cliente_nombre,
              c.razon_social AS cliente_razon_social,
              c.cuit AS cliente_cuit,
              COALESCE(c.direccion, p.guest_direccion) AS cliente_direccion,
              COALESCE(c.telefono, p.guest_telefono) AS cliente_telefono,
              c.zona_reparto,
              u.full_name AS preventista_nombre
       FROM pedidos p
       LEFT JOIN clientes_comercios c ON p.cliente_comercio_id = c.id
       LEFT JOIN users u ON p.preventista_id = u.id
       WHERE p.id = ? AND p.distribuidora_id = ? AND p.deleted_at IS NULL
       LIMIT 1`,
      [pedidoId, distribuidoraId],
    );

    if (pedRows.length === 0) {
      const err = new Error("Pedido no encontrado");
      err.statusCode = 404;
      throw err;
    }

    const [items] = await pool.query(
      `SELECT sku_snapshot, nombre_snapshot, unidad_snapshot, cantidad, precio_unitario, subtotal
       FROM pedido_items
       WHERE pedido_id = ?
       ORDER BY id ASC`,
      [pedidoId],
    );

    const dist = distRows[0];
    const pedido = pedRows[0];
    const esTicket = formato.toLowerCase() === "ticket";

    return new Promise((resolve, reject) => {
      // Ticket 80mm = ~226 pt de ancho; A4 = 595 x 842 pt
      const docOptions = esTicket
        ? { size: [226, 650], margin: 12 }
        : { size: "A4", margin: 40 };

      const doc = new PDFDocument(docOptions);
      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const formatMoney = (val) =>
        `$${Number(val || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
      const fechaStr = new Date(pedido.created_at).toLocaleString("es-AR", {
        dateStyle: "short",
        timeStyle: "short",
      });

      if (esTicket) {
        // ==================== FORMATO TICKET TÉRMICO 80MM ====================
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(dist.nombre_fantasia.toUpperCase(), { align: "center" });
        doc
          .font("Helvetica")
          .fontSize(8)
          .text(`CUIT: ${dist.cuit}`, { align: "center" });
        if (dist.whatsapp_pedidos) {
          doc.text(`Tel: ${dist.whatsapp_pedidos}`, { align: "center" });
        }
        doc.moveDown(0.5);
        doc.text("------------------------------------------", {
          align: "center",
        });
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .text(`REMITO: ${pedido.numero_pedido}`);
        doc.font("Helvetica").fontSize(8).text(`Fecha: ${fechaStr}`);
        doc.text(`Cliente: ${pedido.cliente_nombre}`);
        doc.text(`Dir: ${pedido.cliente_direccion}`);
        if (pedido.zona_reparto) doc.text(`Zona: ${pedido.zona_reparto}`);
        doc.text(`Pago: ${pedido.condicion_pago.replace("_", " ")}`);
        doc.text("------------------------------------------", {
          align: "center",
        });
        doc.moveDown(0.3);

        items.forEach((it) => {
          doc
            .font("Helvetica-Bold")
            .fontSize(8)
            .text(`${it.cantidad}x ${it.nombre_snapshot}`);
          doc
            .font("Helvetica")
            .fontSize(7.5)
            .text(
              `   [${it.unidad_snapshot}] ${formatMoney(it.precio_unitario)} c/u = ${formatMoney(it.subtotal)}`,
            );
        });

        doc.moveDown(0.4);
        doc.text("------------------------------------------", {
          align: "center",
        });
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(`TOTAL: ${formatMoney(pedido.total)}`, { align: "right" });
        doc.moveDown(1.5);
        doc
          .font("Helvetica")
          .fontSize(7.5)
          .text("______________________________", { align: "center" });
        doc.text("Firma y Aclaración Recepción", { align: "center" });
      } else {
        // ==================== FORMATO A4 ESTÁNDAR ====================
        doc.font("Helvetica-Bold").fontSize(18).text(dist.nombre_fantasia);
        doc.font("Helvetica").fontSize(9).fillColor("#475569");
        doc.text(`Razón Social: ${dist.razon_social} | CUIT: ${dist.cuit}`);
        if (dist.whatsapp_pedidos)
          doc.text(`Contacto Pedidos: ${dist.whatsapp_pedidos}`);

        doc
          .font("Helvetica-Bold")
          .fontSize(14)
          .fillColor("#0F172A")
          .text("REMITO DE ENTREGA", 350, 40, { align: "right" });
        doc
          .font("Helvetica")
          .fontSize(10)
          .text(`N°: ${pedido.numero_pedido}`, 350, 60, { align: "right" })
          .text(`Fecha: ${fechaStr}`, 350, 75, { align: "right" })
          .text(`Estado: ${pedido.estado}`, 350, 90, { align: "right" });

        doc.moveTo(40, 115).lineTo(555, 115).strokeColor("#CBD5E1").stroke();

        // Datos del Comercio Cliente
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor("#0F172A")
          .text("DATOS DEL COMERCIO / CLIENTE", 40, 128);
        doc.font("Helvetica").fontSize(9.5).fillColor("#1E293B");
        doc.text(`Comercio: ${pedido.cliente_nombre}`, 40, 145);
        if (pedido.cliente_cuit)
          doc.text(`CUIT: ${pedido.cliente_cuit}`, 350, 145);
        doc.text(`Dirección: ${pedido.cliente_direccion}`, 40, 160);
        if (pedido.zona_reparto)
          doc.text(`Zona Reparto: ${pedido.zona_reparto}`, 350, 160);
        doc.text(
          `Condición de Pago: ${pedido.condicion_pago.replace(/_/g, " ")}`,
          40,
          175,
        );
        if (pedido.preventista_nombre) {
          doc.text(`Preventista: ${pedido.preventista_nombre}`, 350, 175);
        }

        // Encabezado Tabla
        let y = 205;
        doc.rect(40, y, 515, 22).fill("#1E3A8A");
        doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8.5);
        doc.text("SKU", 48, y + 7);
        doc.text("PRODUCTO", 110, y + 7);
        doc.text("PRESENTACIÓN", 300, y + 7);
        doc.text("CANT.", 385, y + 7, { width: 40, align: "right" });
        doc.text("P. UNIT.", 435, y + 7, { width: 55, align: "right" });
        doc.text("SUBTOTAL", 495, y + 7, { width: 55, align: "right" });

        y += 28;
        doc.font("Helvetica").fontSize(9).fillColor("#0F172A");

        items.forEach((it, idx) => {
          if (y > 720) {
            doc.addPage();
            y = 50;
          }
          if (idx % 2 === 1) {
            doc.rect(40, y - 4, 515, 20).fill("#F8FAFC");
            doc.fillColor("#0F172A");
          }
          doc.text(it.sku_snapshot, 48, y);
          doc.text(it.nombre_snapshot, 110, y, { width: 185, ellipsis: true });
          doc.text(it.unidad_snapshot, 300, y, { width: 80 });
          doc.text(String(it.cantidad), 385, y, { width: 40, align: "right" });
          doc.text(formatMoney(it.precio_unitario), 435, y, {
            width: 55,
            align: "right",
          });
          doc.text(formatMoney(it.subtotal), 495, y, {
            width: 55,
            align: "right",
          });
          y += 20;
        });

        // Total y Bloque de Firma
        y += 10;
        doc.moveTo(40, y).lineTo(555, y).strokeColor("#94A3B8").stroke();
        y += 12;
        doc
          .font("Helvetica-Bold")
          .fontSize(13)
          .text(`TOTAL A ABONAR: ${formatMoney(pedido.total)}`, 300, y, {
            width: 255,
            align: "right",
          });

        if (pedido.notas) {
          y += 25;
          doc
            .font("Helvetica-Oblique")
            .fontSize(9)
            .fillColor("#475569")
            .text(`Observaciones: ${pedido.notas}`, 40, y);
        }

        const firmaY = Math.max(y + 65, 730);
        doc
          .moveTo(60, firmaY)
          .lineTo(240, firmaY)
          .strokeColor("#475569")
          .stroke();
        doc
          .font("Helvetica")
          .fontSize(8.5)
          .fillColor("#475569")
          .text("Firma y Sello Comercio Receptor", 60, firmaY + 5, {
            width: 180,
            align: "center",
          });

        doc.moveTo(350, firmaY).lineTo(530, firmaY).stroke();
        doc.text("Firma Chofer / Repartidor", 350, firmaY + 5, {
          width: 180,
          align: "center",
        });
      }

      doc.end();
    });
  }
}

module.exports = new RemitoPdfService();
