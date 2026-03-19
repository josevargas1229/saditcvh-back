// controllers/carga-masiva.controller.js
const path = require("path");
const CargaMasivaService = require("../services/carga-masiva.service");

class CargaMasivaController {
  // Procesar archivo comprimido (ZIP)
  async procesarArchivoComprimido(req, res) {
    try {
      console.log("--- RECIBIENDO ARCHIVO COMPRIMIDO (BACKEND) ---");
      console.log("¿Hay archivo en el request?:", !!req.file);
      console.log(
        "Datos del archivo recibido:",
        req.file
          ? {
              originalname: req.file.originalname,
              mimetype: req.file.mimetype,
              size: req.file.size,
            }
          : "Ninguno",
      );
      console.log("Cuerpo de la petición (req.body):", req.body);
      console.log("-----------------------------------------------");

      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "No se proporcionó archivo" });
      }

      const userId = req.user.id;
      const extension = path.extname(req.file.originalname).toLowerCase();

      if (![".zip"].includes(extension)) {
        return res.status(400).json({
          success: false,
          message: "Formato de archivo no soportado. Únicamente se permiten archivos ZIP (los archivos RAR no están soportados).",
        });
      }

      const useOcr = req.body.useOcr === "true";

      // 1) Extraer PDFs del ZIP
      const archivos = await CargaMasivaService.extraerArchivosComprimidos(
        req.file.buffer,
        extension,
      );

      if (!archivos || archivos.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "No se encontraron archivos PDF dentro del archivo proporcionado",
        });
      }

      // 2) SE ELIMINA el rechazo global por nomenclatura inválida
      // Esto permite que el servicio registre los inválidos en la base de datos
      // para que el usuario pueda ver exactamente qué archivos fallaron en el ZIP.

      // [NUEVA VALIDACIÓN DE PERMISOS "SUBIR"]
      const archivosParsedParaPermisos = archivos.map((a) =>
        CargaMasivaService.parsearNombreArchivoSafe(
          a.nombreOriginal || a.nombre,
        ),
      );
      const permisoCheck = await CargaMasivaService.validarPermisosBatch(
        archivosParsedParaPermisos,
        userId,
        false,
      );
      if (!permisoCheck.success) {
        return res
          .status(403)
          .json({ success: false, message: permisoCheck.message });
      }

      // 3) Si OCR ON => asíncrono
      if (useOcr) {
        const loteId = `lote_${Date.now()}_${userId}`;

        CargaMasivaService.iniciarProcesamientoOCRAsincrono(
          archivos,
          userId,
          loteId,
          {
            allowSinNomenclatura: false, // NORMAL estricto
            origen: "COMPRIMIDO",
          },
        ).catch((error) =>
          console.error("Error en procesamiento asíncrono:", error),
        );

        return res.json({
          success: true,
          message: "Procesamiento OCR iniciado en segundo plano",
          loteId,
          modo: "asincrono",
          endpoints: {
            estado: `/api/carga-masiva/estado-ocr/${loteId}`,
            resultados: `/api/carga-masiva/resultados-ocr/${loteId}`,
          },
        });
      }

      // 4) OCR OFF => sincrónico
      const loteId = `lote_sync_${Date.now()}_${userId}`;

      const resultados = await CargaMasivaService.procesarCargaMasiva(
        archivos,
        userId,
        {
          useOcr: false,
          loteId,
          origen: "COMPRIMIDO",
          allowSinNomenclatura: false, // NORMAL estricto
        },
      );

      return res.json({
        success: true,
        message: "Carga masiva completada",
        resultados,
        modo: "sincrono",
      });
    } catch (error) {
      console.error("Error en procesarArchivoComprimido:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
  // Procesar múltiples archivos PDF directamente - NORMAL (estricto)
  async procesarArchivosMultiples(req, res) {
    try {
      console.log(`\n======================================================`);
      console.log(`[LOG-SUBIDA] [1] RECIBIENDO PETICIÓN MULTIPLE (DIRECTA)`);
      console.log(`[LOG-SUBIDA] Archivos recibidos: ${req.files ? req.files.length : 0}`);
      
      if (!req.files || req.files.length === 0) {
        console.log(`[LOG-SUBIDA] RECHAZADO: No se proporcionaron archivos.`);
        return res
          .status(400)
          .json({ success: false, message: "No se proporcionaron archivos" });
      }

      const userId = req.user.id;
      const useOcr = req.body.useOcr === "true";
      console.log(`[LOG-SUBIDA] Usuario: ${userId} | OCR_ON: ${useOcr}`);

      // Filtrar solo PDFs
      const archivosPDF = req.files.filter(
        (file) =>
          file.mimetype === "application/pdf" ||
          file.originalname.toLowerCase().endsWith(".pdf"),
      );

      if (archivosPDF.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "No se encontraron archivos PDF" });
      }

      // Regla NORMAL: si hay 1 inválido => se rechaza TODO (OCR ON u OFF)
      const invalidos = [];
      for (const f of archivosPDF) {
        try {
          CargaMasivaService.parsearNombreArchivo(f.originalname);
        } catch (e) {
          invalidos.push(f.originalname);
        }
      }

      if (invalidos.length > 0) {
        console.log(`[LOG-SUBIDA] ERROR NOMENCLATURA: Archivos inválidos detectados:`, invalidos);
        return res.status(400).json({
          success: false,
          message:
            "Fallo al subir: hay archivos que no cumplen la nomenclatura obligatoria.",
          invalidos,
        });
      }

      // [NUEVA VALIDACIÓN DE PERMISOS "SUBIR"]
      console.log(`[LOG-SUBIDA] [2] Iniciando validación de permisos "subir"...`);
      const archivosParsedParaPermisos = archivosPDF.map((f) =>
        CargaMasivaService.parsearNombreArchivoSafe(f.originalname),
      );
      const permisoCheck = await CargaMasivaService.validarPermisosBatch(
        archivosParsedParaPermisos,
        userId,
        false,
      );
      if (!permisoCheck.success) {
        console.error(`[LOG-SUBIDA] PERMISOS DENEGADOS: ${permisoCheck.message}`);
        return res
          .status(403)
          .json({ success: false, message: permisoCheck.message });
      }
      console.log(`[LOG-SUBIDA] Permisos OK. Procesando archivos...`);

      // OCR ON => asíncrono
      if (useOcr) {
        const loteId = `lote_directo_${Date.now()}_${userId}`;

        CargaMasivaService.iniciarProcesamientoDirectoOCRAsincrono(
          archivosPDF,
          userId,
          loteId,
          {
            allowSinNomenclatura: true,
            municipioFallbackNum: 85,
            modalidadFallbackNum: 52,
            tipoFallbackAbrev: "P",
            origen: "DIRECTO",
          },
        ).catch((error) =>
          console.error("Error en procesamiento asíncrono:", error),
        );

        return res.json({
          success: true,
          message: "Procesamiento OCR iniciado en segundo plano",
          loteId,
          totalArchivos: archivosPDF.length,
          modo: "asincrono",
          endpoints: {
            estado: `/api/carga-masiva/estado-ocr/${loteId}`,
            resultados: `/api/carga-masiva/resultados-ocr/${loteId}`,
          },
        });
      }

      // OCR OFF => sincrónico
      const loteId = `lote_sync_${Date.now()}_${userId}`;
      console.log(`[LOG-SUBIDA] [4] Ruta Sincrónica activada (Lote: ${loteId}). Llamando a procesarArchivosDirectos...`);

      const resultados = await CargaMasivaService.procesarArchivosDirectos(
        archivosPDF,
        userId,
        {
          useOcr: false,
          loteId,
          origen: "DIRECTO",
          allowSinNomenclatura: false,
        },
      );

      console.log(`[LOG-SUBIDA] [5] Carga Sincrónica FINALIZADA. Exitosos: ${resultados?.exitosos}, Fallidos: ${resultados?.fallidos}`);

      return res.json({
        success: true,
        message: "Carga masiva de archivos completada",
        resultados,
        modo: "sincrono",
      });
    } catch (error) {
      console.error("Error en procesarArchivosMultiples:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // Obtener estado de procesamiento (para procesos asíncronos)
  async obtenerEstadoProcesamiento(req, res) {
    try {
      // Implementar lógica para seguimiento de procesos largos
      // Podrías usar Redis o base de datos para almacenar estado
      res.json({
        success: true,
        estado: "Implementar según necesidad",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
  // Obtener estado de un lote OCR
  async obtenerEstadoOCR(req, res) {
    try {
      const { loteId } = req.params;
      const userId = req.user.id;

      const estado = await CargaMasivaService.obtenerEstadoLoteOCR(
        loteId,
        userId,
      );

      res.json({
        success: true,
        loteId,
        ...estado,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Obtener resultados de un lote OCR
  async obtenerResultadosOCR(req, res) {
    try {
      const { loteId } = req.params;
      const userId = req.user.id;

      const resultados = await CargaMasivaService.obtenerResultadosLoteOCR(
        loteId,
        userId,
      );

      res.json({
        success: true,
        loteId,
        ...resultados,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Listar lotes del usuario
  async listarLotesUsuario(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 20, offset = 0 } = req.query;

      const lotes = await CargaMasivaService.listarLotesPorUsuario(
        userId,
        parseInt(limit),
        parseInt(offset),
      );

      res.json({
        success: true,
        lotes,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
  // SP-N ZIP
  async procesarArchivoComprimidoSinNomenclatura(req, res) {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, message: "No se proporcionó archivo" });
      }

      const userId = req.user.id;
      const extension = path.extname(req.file.originalname).toLowerCase();
      if (![".zip"].includes(extension)) {
        return res.status(400).json({
          success: false,
          message: "Formato de archivo no soportado. Únicamente se permiten archivos ZIP (los archivos RAR no están soportados).",
        });
      }

      const useOcr = req.body.useOcr === "true";

      // EXTRAER ANTES DEL IF (esto es lo que faltaba)
      const archivos = await CargaMasivaService.extraerArchivosComprimidos(
        req.file.buffer,
        extension,
      );
      if (!archivos || archivos.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "No se encontraron archivos PDF dentro del archivo proporcionado",
        });
      }

      // [NUEVA VALIDACIÓN DE PERMISOS "SUBIR" Y MPIO 85]
      const archivosParsedParaPermisos = archivos.map((a) =>
        CargaMasivaService.parsearNombreArchivoSafe(
          a.nombreOriginal || a.nombre,
        ),
      );
      const permisoCheck = await CargaMasivaService.validarPermisosBatch(
        archivosParsedParaPermisos,
        userId,
        true,
      );
      if (!permisoCheck.success) {
        return res
          .status(403)
          .json({ success: false, message: permisoCheck.message });
      }

      if (useOcr) {
        const loteId = `lote_spn_zip_${Date.now()}_${userId}`;

        CargaMasivaService.iniciarProcesamientoOCRAsincrono(
          archivos,
          userId,
          loteId,
          {
            allowSinNomenclatura: true,
            municipioFallbackNum: 85,
            modalidadFallbackNum: 52,
            tipoFallbackAbrev: "P",
            origen: "COMPRIMIDO",
          },
        ).catch((err) =>
          console.error("Error en procesamiento asíncrono:", err),
        );

        return res.json({
          success: true,
          message:
            "Procesamiento OCR iniciado en segundo plano (sin nomenclatura)",
          loteId,
          modo: "asincrono",
          endpoints: {
            estado: `/api/carga-masiva/estado-ocr/${loteId}`,
            resultados: `/api/carga-masiva/resultados-ocr/${loteId}`,
          },
        });
      }

      // Sincrónico (OCR OFF)
      const loteId = `lote_sync_${Date.now()}_${userId}`;
      const resultados = await CargaMasivaService.procesarCargaMasiva(
        archivos,
        userId,
        {
          useOcr: false,
          loteId,
          origen: "COMPRIMIDO",
          allowSinNomenclatura: true,
          municipioFallbackNum: 85,
          modalidadFallbackNum: 52,
          tipoFallbackAbrev: "P",
        },
      );

      return res.json({
        success: true,
        message: "Carga masiva (sin nomenclatura) completada",
        resultados,
        modo: "sincrono",
      });
    } catch (error) {
      console.error(
        "Error en procesarArchivoComprimidoSinNomenclatura:",
        error,
      );
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // SP-N PDFs múltiples
  async procesarArchivosMultiplesSinNomenclatura(req, res) {
    try {
      if (!req.files || req.files.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "No se proporcionaron archivos" });
      }

      const userId = req.user.id;
      const useOcr = req.body.useOcr === "true";

      // EXTRAER ANTES DEL IF (esto es lo que faltaba)
      const archivosPDF = req.files.filter(
        (file) =>
          file.mimetype === "application/pdf" ||
          file.originalname.toLowerCase().endsWith(".pdf"),
      );

      if (archivosPDF.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "No se encontraron archivos PDF" });
      }

      // [NUEVA VALIDACIÓN DE PERMISOS "SUBIR" Y MPIO 85]
      const archivosParsedParaPermisos = archivosPDF.map((f) =>
        CargaMasivaService.parsearNombreArchivoSafe(f.originalname),
      );
      const permisoCheck = await CargaMasivaService.validarPermisosBatch(
        archivosParsedParaPermisos,
        userId,
        true,
      );
      if (!permisoCheck.success) {
        return res
          .status(403)
          .json({ success: false, message: permisoCheck.message });
      }

      const archivosProcesados = archivosPDF.map((file) => ({
        nombre: file.originalname,
        buffer: file.buffer,
        tamano: file.size,
        originalname: file.originalname, // por seguridad
      }));

      if (useOcr) {
        const loteId = `lote_spn_directo_${Date.now()}_${userId}`;

        CargaMasivaService.iniciarProcesamientoDirectoOCRAsincrono(
          archivosProcesados,
          userId,
          loteId,
          {
            allowSinNomenclatura: true,
            municipioFallbackNum: 85,
            modalidadFallbackNum: 52,
            tipoFallbackAbrev: "P",
            origen: "DIRECTO",
          },
        ).catch((err) =>
          console.error("Error en procesamiento asíncrono:", err),
        );

        return res.json({
          success: true,
          message:
            "Procesamiento OCR iniciado en segundo plano (sin nomenclatura)",
          loteId,
          totalArchivos: archivosProcesados.length,
          modo: "asincrono",
          endpoints: {
            estado: `/api/carga-masiva/estado-ocr/${loteId}`,
            resultados: `/api/carga-masiva/resultados-ocr/${loteId}`,
          },
        });
      }

      // Sincrónico (OCR OFF)
      const loteId = `lote_sync_${Date.now()}_${userId}`;
      const resultados = await CargaMasivaService.procesarCargaMasiva(
        archivosProcesados,
        userId,
        {
          useOcr: false,
          loteId,
          origen: "DIRECTO",
          allowSinNomenclatura: true,
          municipioFallbackNum: 85,
          modalidadFallbackNum: 52,
          tipoFallbackAbrev: "P",
        },
      );

      return res.json({
        success: true,
        message: "Carga masiva (sin nomenclatura) completada",
        resultados,
        modo: "sincrono",
      });
    } catch (error) {
      console.error(
        "Error en procesarArchivosMultiplesSinNomenclatura:",
        error,
      );
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = new CargaMasivaController();
