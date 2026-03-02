const express = require("express");
const router = express.Router();

const documentoController = require("../controllers/documento.controller");
const { upload } = require("../../../middlewares/upload.middleware");

const {
  protect,
  restrictTo,
} = require("../../auth/middlewares/auth.middleware");

router.use(protect);

// =====================
// Consultas
// =====================
router.get("/", documentoController.search);
router.get("/estadisticas", documentoController.getEstadisticas);
router.get(
  "/autorizacion/:autorizacionId",
  documentoController.getByAutorizacion,
);
router.get("/:id/preview", documentoController.preview);
router.get("/:id", documentoController.getById);

// =====================
// Creación
// =====================
router.post("/", upload.single("archivo"), documentoController.crear);
router.post(
  "/:id/version",
  upload.single("archivo"),
  documentoController.crearVersion,
);

// =====================
// Actualización / Eliminación
// =====================
router.put("/:id", documentoController.update);
router.delete("/:id", documentoController.delete);
router.delete(
  "/:id/version/:versionId",
  restrictTo("administrador"),
  documentoController.eliminarVersion,
);

// =====================
// Archivos
// =====================
router.get(
  "/archivo/:archivoId/descargar",
  documentoController.descargarArchivo,
);

module.exports = router;
