const authService = require("../services/auth.service");
const { sendSuccess } = require("../middlewares/response.middleware");

class AuthController {
  async login(req, res, next) {
    try {
      const result = await authService.loginInterno(req.body);
      return sendSuccess(res, result, "Inicio de sesión exitoso");
    } catch (error) {
      next(error);
    }
  }

  async getInternalBootstrap(req, res, next) {
    try {
      const config = await authService.getBootstrap(req.distribuidoraId);
      return sendSuccess(res, config, "Configuración de distribuidora cargada");
    } catch (error) {
      next(error);
    }
  }

  async getPublicBootstrap(req, res, next) {
    try {
      const config = await authService.getBootstrap(req.distribuidoraId);
      return sendSuccess(res, config, "Tienda pública cargada");
    } catch (error) {
      next(error);
    }
  }

  async loginPublicComercio(req, res, next) {
    try {
      const result = await authService.loginComercioPublico(
        req.distribuidoraId,
        req.body,
      );
      return sendSuccess(res, result, "Acceso mayorista concedido");
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
