const express = require("express");
const router = express.Router();
const auditController = require("../controllers/audit.controller");
const { protect, restrictTo } = require("../../auth/middlewares/auth.middleware");

/**
 * Ruta para obtener el historial de acciones.
 * Solo accesible para administradores autenticados.
 */
router.get("/", protect, auditController.getLogs);

/**
 * Ruta para obtener detalles de una acción específica.
 * Solo accesible para administradores autenticados.
 */
router.get("/:id", protect, auditController.getLogById);

module.exports = router;