const clienteService = require("../services/cliente.service");
const { sendSuccess } = require("../middlewares/response.middleware");

class ClienteController {
  async listar(req, res, next) {
    try {
      const data = await clienteService.listarComercios(
        req.distribuidoraId,
        req.query,
      );
      return sendSuccess(res, data, "Comercios clientes obtenidos");
    } catch (error) {
      next(error);
    }
  }

  async crear(req, res, next) {
    try {
      const data = await clienteService.crearComercio(
        req.distribuidoraId,
        req.user.userId,
        req.body,
      );
      return sendSuccess(res, data, "Comercio cliente registrado", 201);
    } catch (error) {
      next(error);
    }
  }

  async actualizar(req, res, next) {
    try {
      const data = await clienteService.actualizarComercio(
        req.distribuidoraId,
        Number(req.params.id),
        req.body,
      );
      return sendSuccess(res, data, "Comercio cliente actualizado");
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ClienteController();
