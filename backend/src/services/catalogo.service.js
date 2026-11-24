const XLSX = require("xlsx");
const pool = require("../config/db");
const { excelProductoRowSchema } = require("../schemas/catalogo.schema");

// Normaliza nombres de columnas del Excel (ignora mayúsculas, tildes y espacios)
function normalizarFilaExcel(rawRow) {
  const clean = {};
  for (const [k, v] of Object.entries(rawRow)) {
    const key = String(k)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_");
    clean[key] = v;
  }

  return {
    SKU: String(clean.sku ?? clean.codigo ?? clean.cod ?? "").trim(),
    Nombre: String(
      clean.nombre ?? clean.producto ?? clean.descripcion ?? "",
    ).trim(),
    Categoria:
      String(clean.categoria ?? clean.rubro ?? "General").trim() || "General",
    Unidad_Venta:
      String(
        clean.unidad_venta ?? clean.presentacion ?? clean.unidad ?? "Unidad",
      ).trim() || "Unidad",
    Precio_Minorista: Number(
      clean.precio_minorista ??
        clean.minorista ??
        clean.precio_publico ??
        clean.precio_mayorista ??
        clean.mayorista ??
        0,
    ),
    Precio_Mayorista: Number(
      clean.precio_mayorista ?? clean.mayorista ?? clean.precio ?? 0,
    ),
    Precio_Especial:
      clean.precio_especial !== undefined && clean.precio_especial !== ""
        ? Number(clean.precio_especial)
        : undefined,
    Stock_Inicial: Number(
      clean.stock_inicial ?? clean.stock ?? clean.cantidad ?? 0,
    ),
  };
}

class CatalogoService {
  async listarCategorias(distribuidoraId) {
    const [rows] = await pool.query(
      `SELECT id, nombre, orden
       FROM categorias
       WHERE distribuidora_id = ? AND is_active = 1 AND deleted_at IS NULL
       ORDER BY orden ASC, nombre ASC`,
      [distribuidoraId],
    );
    return rows;
  }

  async crearCategoria(distribuidoraId, { nombre, orden }) {
    const [res] = await pool.query(
      `INSERT INTO categorias (distribuidora_id, nombre, orden) VALUES (?, ?, ?)`,
      [distribuidoraId, nombre, orden],
    );
    return { id: res.insertId, nombre, orden };
  }

  async listarProductosInterno(
    distribuidoraId,
    { q = "", categoria_id = null, solo_con_stock = false } = {},
  ) {
    let sql = `
      SELECT p.id, p.categoria_id, c.nombre AS categoria_nombre, p.sku, p.nombre, p.marca,
             p.unidad_venta, p.image_url, p.precio_minorista, p.precio_mayorista, p.precio_especial,
             p.costo_reposicion, p.stock_actual, p.stock_minimo, p.visible_en_web, p.is_active
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.distribuidora_id = ? AND p.deleted_at IS NULL
    `;
    const params = [distribuidoraId];

    if (q) {
      sql += ` AND (p.nombre LIKE ? OR p.sku LIKE ? OR p.marca LIKE ?)`;
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    if (categoria_id) {
      sql += ` AND p.categoria_id = ?`;
      params.push(Number(categoria_id));
    }

    if (solo_con_stock === "true" || solo_con_stock === true) {
      sql += ` AND p.stock_actual > 0 AND p.is_active = 1`;
    }

    sql += ` ORDER BY p.nombre ASC`;

    const [rows] = await pool.query(sql, params);
    return rows;
  }

  async listarCatalogoPublico(
    distribuidoraId,
    { q = "", categoria_id = null } = {},
  ) {
    let sql = `
      SELECT p.id, p.categoria_id, c.nombre AS categoria_nombre, p.sku, p.nombre, p.marca,
             p.unidad_venta, p.image_url, p.precio_minorista, p.precio_mayorista, p.precio_especial,
             p.stock_actual
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.distribuidora_id = ?
        AND p.is_active = 1
        AND p.visible_en_web = 1
        AND p.deleted_at IS NULL
    `;
    const params = [distribuidoraId];

    if (q) {
      sql += ` AND (p.nombre LIKE ? OR p.marca LIKE ? OR p.sku LIKE ?)`;
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    if (categoria_id) {
      sql += ` AND p.categoria_id = ?`;
      params.push(Number(categoria_id));
    }

    sql += ` ORDER BY c.orden ASC, p.nombre ASC`;

    const [rows] = await pool.query(sql, params);
    return rows;
  }

  async crearProducto(distribuidoraId, data) {
    const [res] = await pool.query(
      `INSERT INTO productos (
        distribuidora_id, categoria_id, sku, nombre, marca, unidad_venta, image_url,
        precio_minorista, precio_mayorista, precio_especial, costo_reposicion,
        stock_actual, stock_minimo, visible_en_web
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        distribuidoraId,
        data.categoria_id || null,
        data.sku,
        data.nombre,
        data.marca || null,
        data.unidad_venta,
        data.image_url || null,
        data.precio_minorista,
        data.precio_mayorista,
        data.precio_especial,
        data.costo_reposicion ?? 0,
        data.stock_actual ?? 0,
        data.stock_minimo ?? 5,
        data.visible_en_web ? 1 : 0,
      ],
    );
    return { id: res.insertId, ...data };
  }

  async actualizarProducto(distribuidoraId, productoId, updates) {
    const fields = [];
    const values = [];

    const allowed = [
      "categoria_id",
      "sku",
      "nombre",
      "marca",
      "unidad_venta",
      "image_url",
      "precio_minorista",
      "precio_mayorista",
      "precio_especial",
      "costo_reposicion",
      "stock_actual",
      "stock_minimo",
    ];

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    }

    if (updates.visible_en_web !== undefined) {
      fields.push("visible_en_web = ?");
      values.push(updates.visible_en_web ? 1 : 0);
    }
    if (updates.is_active !== undefined) {
      fields.push("is_active = ?");
      values.push(updates.is_active ? 1 : 0);
    }

    if (fields.length === 0) return { updated: false };

    values.push(productoId, distribuidoraId);
    const [res] = await pool.query(
      `UPDATE productos SET ${fields.join(", ")} WHERE id = ? AND distribuidora_id = ? AND deleted_at IS NULL`,
      values,
    );

    if (res.affectedRows === 0) {
      const err = new Error("Producto no encontrado");
      err.statusCode = 404;
      throw err;
    }

    return { updated: true };
  }

  async ajustarStock(distribuidoraId, productoId, cantidad) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        `SELECT id, nombre, stock_actual FROM productos WHERE id = ? AND distribuidora_id = ? AND deleted_at IS NULL FOR UPDATE`,
        [productoId, distribuidoraId],
      );

      if (rows.length === 0) {
        const err = new Error("Producto no encontrado");
        err.statusCode = 404;
        throw err;
      }

      const nuevoStock = rows[0].stock_actual + cantidad;
      if (nuevoStock < 0) {
        const err = new Error(
          `El stock resultante no puede ser negativo (actual: ${rows[0].stock_actual})`,
        );
        err.statusCode = 400;
        throw err;
      }

      await connection.query(
        `UPDATE productos SET stock_actual = ? WHERE id = ? AND distribuidora_id = ?`,
        [nuevoStock, productoId, distribuidoraId],
      );

      await connection.commit();
      return { id: productoId, stock_actual: nuevoStock };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async importarDesdeExcel(distribuidoraId, fileBuffer) {
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });

    // Buscar la primera hoja con datos
    let rawRows = [];
    for (const sheetName of workbook.SheetNames) {
      const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        defval: "",
      });
      if (sheetData.length > 0) {
        rawRows = sheetData.map(normalizarFilaExcel).filter((r) => {
          const skuUpper = String(r.SKU || "")
            .trim()
            .toUpperCase();
          const nombreUpper = String(r.Nombre || "")
            .trim()
            .toUpperCase();
          const tieneDatos = skuUpper !== "" || nombreUpper !== "";
          const esTotal =
            nombreUpper === "TOTALES" ||
            nombreUpper === "TOTAL" ||
            skuUpper === "TOTAL" ||
            skuUpper === "TOTALES";
          return tieneDatos && !esTotal;
        });
        if (rawRows.length > 0) break;
      }
    }

    if (rawRows.length === 0) {
      const err = new Error(
        "No se encontraron filas con datos. Verificá que la planilla tenga columnas SKU y Nombre.",
      );
      err.statusCode = 400;
      throw err;
    }

    const filasValidas = [];
    const errores = [];
    const skusVistos = new Set();

    rawRows.forEach((row, index) => {
      const numeroFila = index + 2;
      const parsed = excelProductoRowSchema.safeParse(row);

      if (!parsed.success) {
        const msgs = parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(" | ");
        errores.push({ fila: numeroFila, error: msgs });
        return;
      }

      const item = parsed.data;
      if (skusVistos.has(item.SKU.toUpperCase())) {
        errores.push({
          fila: numeroFila,
          error: `SKU duplicado dentro del archivo: ${item.SKU}`,
        });
        return;
      }

      skusVistos.add(item.SKU.toUpperCase());
      filasValidas.push({
        ...item,
        Precio_Especial: item.Precio_Especial ?? item.Precio_Mayorista,
      });
    });

    if (errores.length > 0) {
      const err = new Error(
        `Se encontraron ${errores.length} errores en el Excel. Corregilos antes de importar.`,
      );
      err.statusCode = 400;
      err.validationErrors = errores;
      throw err;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [catsExistentes] = await connection.query(
        `SELECT id, LOWER(nombre) AS nombre_lower FROM categorias WHERE distribuidora_id = ? AND deleted_at IS NULL`,
        [distribuidoraId],
      );
      const catMap = new Map(catsExistentes.map((c) => [c.nombre_lower, c.id]));

      let insertadosOActualizados = 0;

      for (const item of filasValidas) {
        const catKey = item.Categoria.toLowerCase();
        let categoriaId = catMap.get(catKey);

        if (!categoriaId) {
          const [catRes] = await connection.query(
            `INSERT INTO categorias (distribuidora_id, nombre, orden) VALUES (?, ?, 99)`,
            [distribuidoraId, item.Categoria],
          );
          categoriaId = catRes.insertId;
          catMap.set(catKey, categoriaId);
        }

        await connection.query(
          `INSERT INTO productos (
            distribuidora_id, categoria_id, sku, nombre, unidad_venta,
            precio_minorista, precio_mayorista, precio_especial, stock_actual, is_active, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL)
          ON DUPLICATE KEY UPDATE
            categoria_id = VALUES(categoria_id),
            nombre = VALUES(nombre),
            unidad_venta = VALUES(unidad_venta),
            precio_minorista = VALUES(precio_minorista),
            precio_mayorista = VALUES(precio_mayorista),
            precio_especial = VALUES(precio_especial),
            stock_actual = VALUES(stock_actual),
            is_active = 1,
            deleted_at = NULL`,
          [
            distribuidoraId,
            categoriaId,
            item.SKU,
            item.Nombre,
            item.Unidad_Venta,
            item.Precio_Minorista,
            item.Precio_Mayorista,
            item.Precio_Especial,
            item.Stock_Inicial,
          ],
        );

        insertadosOActualizados++;
      }

      await connection.commit();
      return {
        procesados: insertadosOActualizados,
        mensaje: `${insertadosOActualizados} productos importados/actualizados correctamente.`,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = new CatalogoService();
