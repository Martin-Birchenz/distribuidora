const catalogoService = require("../services/catalogo.service");
const { sendSuccess } = require("../middlewares/response.middleware");
const XLSX = require("xlsx");

class CatalogoController {
  async getCategorias(req, res, next) {
    try {
      const data = await catalogoService.listarCategorias(req.distribuidoraId);
      return sendSuccess(res, data, "Categorías obtenidas");
    } catch (error) {
      next(error);
    }
  }

  async postCategoria(req, res, next) {
    try {
      const data = await catalogoService.crearCategoria(
        req.distribuidoraId,
        req.body,
      );
      return sendSuccess(res, data, "Categoría creada", 201);
    } catch (error) {
      next(error);
    }
  }

  async getProductosInterno(req, res, next) {
    try {
      const data = await catalogoService.listarProductosInterno(
        req.distribuidoraId,
        req.query,
      );
      return sendSuccess(res, data, "Catálogo obtenido");
    } catch (error) {
      next(error);
    }
  }

  async getCatalogoPublico(req, res, next) {
    try {
      const [categorias, productos] = await Promise.all([
        catalogoService.listarCategorias(req.distribuidoraId),
        catalogoService.listarCatalogoPublico(req.distribuidoraId, req.query),
      ]);
      return sendSuccess(
        res,
        { categorias, productos },
        "Catálogo público obtenido",
      );
    } catch (error) {
      next(error);
    }
  }

  async postProducto(req, res, next) {
    try {
      const data = await catalogoService.crearProducto(
        req.distribuidoraId,
        req.body,
      );
      return sendSuccess(res, data, "Producto creado", 201);
    } catch (error) {
      next(error);
    }
  }

  async patchProducto(req, res, next) {
    try {
      const data = await catalogoService.actualizarProducto(
        req.distribuidoraId,
        Number(req.params.id),
        req.body,
      );
      return sendSuccess(res, data, "Producto actualizado");
    } catch (error) {
      next(error);
    }
  }

  async postAjusteStock(req, res, next) {
    try {
      const data = await catalogoService.ajustarStock(
        req.distribuidoraId,
        Number(req.params.id),
        req.body.cantidad,
      );
      return sendSuccess(res, data, "Stock actualizado");
    } catch (error) {
      next(error);
    }
  }

  async importExcel(req, res, next) {
    try {
      if (!req.file) {
        const err = new Error("Adjuntá un archivo Excel (.xlsx o .xls)");
        err.statusCode = 400;
        throw err;
      }
      const result = await catalogoService.importarDesdeExcel(
        req.distribuidoraId,
        req.file.buffer,
      );
      return sendSuccess(res, result, result.mensaje);
    } catch (error) {
      next(error);
    }
  }

  async descargarPlantillaExcel(req, res, next) {
    try {
      const ejemploFilas = [
        {
          SKU: "BEB-001",
          Nombre: "Gaseosa Cola 2.25L",
          Categoria: "Bebidas",
          Unidad_Venta: "Pack x6",
          Precio_Minorista: 14500,
          Precio_Mayorista: 11800,
          Precio_Especial: 11000,
          Stock_Inicial: 60,
        },
        {
          SKU: "BEB-002",
          Nombre: "Cerveza Rubia Retornable 1L",
          Categoria: "Bebidas",
          Unidad_Venta: "Cajón x12",
          Precio_Minorista: 26000,
          Precio_Mayorista: 21500,
          Precio_Especial: 20200,
          Stock_Inicial: 45,
        },
        {
          SKU: "LIM-010",
          Nombre: "Lavandina Concentrada 2L",
          Categoria: "Limpieza",
          Unidad_Venta: "Pack x4",
          Precio_Minorista: 7200,
          Precio_Mayorista: 5600,
          Precio_Especial: 5200,
          Stock_Inicial: 80,
        },
        {
          SKU: "ALM-005",
          Nombre: "Yerba Mate Tradicional 1kg",
          Categoria: "Almacén",
          Unidad_Venta: "Bulto x10",
          Precio_Minorista: 39000,
          Precio_Mayorista: 33500,
          Precio_Especial: 32000,
          Stock_Inicial: 30,
        },
      ];

      const worksheet = XLSX.utils.json_to_sheet(ejemploFilas);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Catalogo");

      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="plantilla_catalogo_distribuidora.xlsx"',
      );
      return res.send(buffer);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CatalogoController();
