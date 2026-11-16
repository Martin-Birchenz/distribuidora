const superAdminService = require("../services/superadmin.service");
const { sendSuccess } = require("../middlewares/response.middleware");

class SuperAdminController {
  async listar(req, res, next) {
    try {
      const data = await superAdminService.listarDistribuidoras();
      return sendSuccess(res, data, "Distribuidoras obtenidas");
    } catch (error) {
      next(error);
    }
  }

  async crear(req, res, next) {
    try {
      const created = await superAdminService.crearDistribuidoraConSeed(
        req.body,
      );
      return sendSuccess(
        res,
        created,
        "Distribuidora creada y configurada",
        201,
      );
    } catch (error) {
      next(error);
    }
  }

  async actualizar(req, res, next) {
    try {
      const result = await superAdminService.actualizarDistribuidora(
        Number(req.params.id),
        req.body,
      );
      return sendSuccess(res, result, "Distribuidora actualizada");
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SuperAdminController();
