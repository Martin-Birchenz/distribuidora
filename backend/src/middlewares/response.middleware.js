const sendSuccess = (
  res,
  data = null,
  message = "Operación exitosa",
  statusCode = 200,
  meta = null,
) => {
  const response = {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  };

  if (meta !== null) {
    response.meta = meta;
  }

  return res.status(statusCode).json(response);
};

module.exports = { sendSuccess };
