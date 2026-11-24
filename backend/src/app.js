const express = require("express");
const cors = require("cors");
const { errorHandler } = require("./middlewares/error.middleware");

const authRoutes = require("./routes/auth.routes");
const superadminRoutes = require("./routes/superadmin.routes");
const publicRoutes = require("./routes/public.routes");
const internalRoutes = require("./routes/internal.routes");
const whatsappRoutes = require("./routes/whatsapp.routes");

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  process.env.FRONTEND_URL,
]
  .filter(Boolean)
  .map((u) => u.trim().replace(/\/$/, ""));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isAllowed =
        allowedOrigins.includes(origin) || origin.endsWith(".vercel.app");
      if (isAllowed) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-distribuidora-id",
      "x-tenant-slug",
    ],
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "SaaS Distribuidoras B2B API",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/superadmin", superadminRoutes);
app.use("/api/v1/public/t/:slug", publicRoutes);
app.use("/api/v1/internal", internalRoutes);
app.use("/api/v1/webhooks/whatsapp", whatsappRoutes);

app.use(errorHandler);

module.exports = app;
