// routes/carga-masiva.routes.js
const express = require('express');
const router = express.Router();
const CargaMasivaController = require('../controllers/carga-masiva.controller');
const multer = require('multer');
const { protect } = require('../../auth/middlewares/auth.middleware');

router.use(protect);

// ============== MULTER ZIP/RAR ==============
const storageComprimido = multer.memoryStorage();
const uploadComprimido = multer({
    storage: storageComprimido,
    limits: {
        fileSize: 2 * 1024 * 1024 * 1024, // 2GB
        files: 1,
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/zip',
            'application/x-zip-compressed',
            'application/x-rar-compressed',
            'application/octet-stream',
        ];

        const allowedExtensions = ['.zip', '.rar'];

        if (
            allowedTypes.includes(file.mimetype) ||
            allowedExtensions.some((ext) => file.originalname.toLowerCase().endsWith(ext))
        ) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de archivo no permitido. Solo ZIP o RAR'));
        }
    },
});

// ============== MULTER PDFs ==============
const storagePDFs = multer.memoryStorage();
const uploadPDFs = multer({
    storage: storagePDFs,
    limits: {
        fileSize: 2 * 1024 * 1024 * 1024, // 2GB por archivo
        files: 100,
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos PDF'));
        }
    },
});

// ============== NORMAL (estricto) ==============
router.post('/comprimido', uploadComprimido.single('archivo'), CargaMasivaController.procesarArchivoComprimido);

router.post('/pdfs-multiples', uploadPDFs.array('archivos', 100), CargaMasivaController.procesarArchivosMultiples);

// ============== OCR seguimiento ==============
router.get('/estado-ocr/:loteId', CargaMasivaController.obtenerEstadoOCR);
router.get('/resultados-ocr/:loteId', CargaMasivaController.obtenerResultadosOCR);
router.get('/lotes', CargaMasivaController.listarLotesUsuario);

// (compat)
router.get('/estado/:procesoId', CargaMasivaController.obtenerEstadoProcesamiento);

// ============== SP-N (sin nomenclatura, OCR OFF) ==============
router.post(
    '/comprimido-sin-nomenclatura',
    uploadComprimido.single('archivo'),
    CargaMasivaController.procesarArchivoComprimidoSinNomenclatura
);

router.post(
    '/pdfs-multiples-sin-nomenclatura',
    uploadPDFs.array('archivos', 100),
    CargaMasivaController.procesarArchivosMultiplesSinNomenclatura
);

module.exports = router;