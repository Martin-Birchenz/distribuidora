const { ZodError } = require("zod");

const errorHandler = (err, req, res, next) => {
  if (err instanceof ZodError) {
    const issues = err.issues || err.errors || [];
    return res.status(400).json({
      success: false,
      message: "Error de validación en los datos enviados",
      errors: issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
      timestamp: new Date().toISOString(),
    });
  }

  if (err.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      message:
        "Ya existe un registro con ese identificador único en esta distribuidora",
      timestamp: new Date().toISOString(),
    });
  }

  const statusCode = err.statusCode || 500;
  const message =
    statusCode === 500 && process.env.NODE_ENV === "production"
      ? "Error interno del servidor"
      : err.message || "Error interno del servidor";

  if (statusCode === 500) {
    console.error("[Server Error]:", err);
  }

  return res.status(statusCode).json({
    success: false,
    message,
    timestamp: new Date().toISOString(),
  });
};

module.exports = { errorHandler };
