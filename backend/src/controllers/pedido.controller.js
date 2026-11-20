const jwt = require("jsonwebtoken");
const pedidoService = require("../services/pedido.service");
const cuentaCorrienteService = require("../services/cuentaCorriente.service");
const { sendSuccess } = require("../middlewares/response.middleware");
const remitoPdfService = require("../services/remitoPdf.service");

class PedidoController {
  async crearInterno(req, res, next) {
    try {
      const origen =
        req.user.role === "PREVENTISTA" ? "CALLE_APP" : "ADMIN_MANUAL";
      const result = await pedidoService.crearPedidoTransaccional({
        distribuidoraId: req.distribuidoraId,
        userId: req.user.userId,
        payload: { ...req.body, origen },
      });
      return sendSuccess(res, result, "Pedido registrado correctamente", 201);
    } catch (error) {
      next(error);
    }
  }

  async crearPublico(req, res, next) {
    try {
      let comercioId = null;
      let listaAplicada = "MINORISTA";
      let origen = "WEB_MINORISTA";

      // Si el comercio inició sesión B2B en la tienda pública, validar su token
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const decoded = jwt.verify(
            authHeader.split(" ")[1],
            process.env.JWT_SECRET,
          );
          if (
            decoded.type === "COMERCIO_B2B" &&
            decoded.distribuidoraId === req.distribuidoraId
          ) {
            comercioId = decoded.comercioId;
            listaAplicada = req.body.lista_aplicada || "MAYORISTA";
            origen = "WEB_B2B";
          }
        } catch (_) {
          // Si el token expiró, continúa como invitado o rechaza si pidió cuenta corriente
        }
      }

      const condicionPago =
        comercioId && req.body.condicion_pago === "CUENTA_CORRIENTE"
          ? "CUENTA_CORRIENTE"
          : req.body.condicion_pago === "TRANSFERENCIA"
            ? "TRANSFERENCIA"
            : "CONTADO_ENTREGA";

      const result = await pedidoService.crearPedidoTransaccional({
        distribuidoraId: req.distribuidoraId,
        userId: null,
        payload: {
          ...req.body,
          cliente_comercio_id: comercioId,
          lista_aplicada: comercioId ? listaAplicada : "MINORISTA",
          condicion_pago: condicionPago,
          origen,
        },
      });

      return sendSuccess(res, result, "Pedido enviado a la distribuidora", 201);
    } catch (error) {
      next(error);
    }
  }

  async listar(req, res, next) {
    try {
      const data = await pedidoService.listarPedidos(
        req.distribuidoraId,
        req.query,
      );
      return sendSuccess(res, data, "Pedidos obtenidos");
    } catch (error) {
      next(error);
    }
  }

  async detalle(req, res, next) {
    try {
      const data = await pedidoService.obtenerDetallePedido(
        req.distribuidoraId,
        Number(req.params.id),
      );
      return sendSuccess(res, data, "Detalle de pedido obtenido");
    } catch (error) {
      next(error);
    }
  }

  async cambiarEstado(req, res, next) {
    try {
      const data = await pedidoService.cambiarEstadoPedido(
        req.distribuidoraId,
        req.user.userId,
        req.user.role,
        Number(req.params.id),
        req.body.estado,
      );
      return sendSuccess(res, data, "Estado del pedido actualizado");
    } catch (error) {
      next(error);
    }
  }

  async hojaCarga(req, res, next) {
    try {
      const data = await pedidoService.generarHojaCargaCamion(
        req.distribuidoraId,
        req.query,
      );
      return sendSuccess(res, data, "Comanda consolidada de carga generada");
    } catch (error) {
      next(error);
    }
  }

  async getCuentaCorrienteCliente(req, res, next) {
    try {
      const data = await cuentaCorrienteService.obtenerMovimientosCliente(
        req.distribuidoraId,
        Number(req.params.clienteId),
      );
      return sendSuccess(res, data, "Cuenta corriente obtenida");
    } catch (error) {
      next(error);
    }
  }

  async postCobranza(req, res, next) {
    try {
      const data = await cuentaCorrienteService.registrarCobranza(
        req.distribuidoraId,
        req.user.userId,
        req.body,
      );
      return sendSuccess(
        res,
        data,
        "Cobranza registrada en cuenta corriente",
        201,
      );
    } catch (error) {
      next(error);
    }
  }

  async getResumenDeudores(req, res, next) {
    try {
      const data = await cuentaCorrienteService.resumenSaldosDeudores(
        req.distribuidoraId,
      );
      return sendSuccess(res, data, "Resumen de saldos deudores obtenido");
    } catch (error) {
      next(error);
    }
  }

  async descargarRemitoPdf(req, res, next) {
    try {
      const pedidoId = Number(req.params.id);
      const formato = req.query.formato === "ticket" ? "ticket" : "a4";
      const pdfBuffer = await remitoPdfService.generarRemitoBuffer(
        req.distribuidoraId,
        pedidoId,
        formato,
      );

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="remito_pedido_${pedidoId}_${formato}.pdf"`,
      );
      return res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PedidoController();
