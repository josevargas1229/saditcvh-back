/**
 * RUTAS: MunicipioRoutes
 * DESCRIPCIÓN: Definición de puntos de acceso (endpoints) para la entidad de Municipios.
 */
const express = require("express");
const router = express.Router();
const controller = require("../controllers/municipio.controller");

// Acceso al catálogo completo de municipios
router.get("/", controller.getMunicipios);

// Consulta de detalles por identificador único
router.get("/:id", controller.getMunicipioById);

module.exports = router;