// services/carga-masiva.service.js
const AdmZip = require("adm-zip");
const fs = require("fs").promises;
const path = require("path");
const Autorizacion = require("../../explorer/models/autorizacion.model");
const Municipio = require("../../municipios/models/municipio.model");
const Modalidad = require("../../explorer/models/Modalidad.model");
const TiposAutorizacion = require("../../explorer/models/TiposAutorizacion.model");
const Documento = require("../../explorer/models/documento.model");
const ArchivoDigital = require("../../explorer/models/archivo-digital.model");
const User = require("../../users/models/user.model");
const crypto = require("crypto");
const { Op } = require("sequelize");
const OCRProcessorService = require("./ocr-processor.service");
const OCRProceso = require("../../digitalizacion/models/ocr-proceso.model"); // Añadir modelo
class CargaMasivaService {
  constructor() {
    this.autorizacionModel = Autorizacion;
    this.municipioModel = Municipio;
    this.modalidadModel = Modalidad;
    this.tiposAutorizacionModel = TiposAutorizacion;
    this.documentoModel = Documento;
    this.archivoDigitalModel = ArchivoDigital;
    this.ocrProcesoModel = OCRProceso;
  }

  // Extraer archivos de ZIP/RAR
  async extraerArchivosComprimidos(archivoBuffer, extension) {
    try {
      const archivos = [];
      const tempDir = path.join(process.cwd(), "temp", Date.now().toString());

      await fs.mkdir(tempDir, { recursive: true });

      if (extension === ".zip") {
        const zip = new AdmZip(archivoBuffer);
        zip.extractAllTo(tempDir, true);
      } else if (extension === ".rar") {
        // Para RAR necesitarías una librería como unrar
        throw new Error("Formato RAR no soportado actualmente");
      }

      // Recorrer estructura de carpetas
      const leerCarpetasRecursivamente = async (dir, basePath = "") => {
        const items = await fs.readdir(dir, { withFileTypes: true });

        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          const relativePath = path.join(basePath, item.name);

          if (item.isDirectory()) {
            await leerCarpetasRecursivamente(fullPath, relativePath);
          } else if (
            item.isFile() &&
            item.name.toLowerCase().endsWith(".pdf")
          ) {
            const buffer = await fs.readFile(fullPath);
            archivos.push({
              nombre: item.name,
              buffer: buffer,
              rutaRelativa: relativePath,
              tamano: buffer.length,
              extension: path.extname(item.name),
            });
          }
        }
      };

      await leerCarpetasRecursivamente(tempDir);

      // Limpiar directorio temporal
      await fs.rm(tempDir, { recursive: true, force: true });

      return archivos;
    } catch (error) {
      throw new Error(`Error al extraer archivos: ${error.message}`);
    }
  }

  parsearNombreArchivo(nombreArchivo) {
    try {
      const nombreSinExtension = nombreArchivo.replace(/\.pdf$/i, "");
      const nombreSinPaginas = nombreSinExtension.replace(
        /\s*\(\d+\s*(pag\.?)?\)$/i,
        "",
      );

      // Regex robusta para capturar: AuthNum | Muni | Mod | Cons1 | Cons2 | Tipo (opcional)
      // separador puede ser espacio, guion o guion bajo
      const regex =
        /^(\d+)[_\s-]+(\d+)[_\s-]+(\d+)[_\s-]+(\d+)[_\s-]+(\d+)[_\s-]*([a-zA-Z]+)?/i;
      const match = nombreSinPaginas.match(regex);

      if (!match) {
        throw new Error(`Formato de nombre inválido: ${nombreArchivo}`);
      }

      const numeroAutorizacion = match[1];
      // Asegurarnos de usar 2 dígitos donde corresponde y 3 donde corresponde
      const muni = match[2].padStart(2, "0");
      const mod = match[3].padStart(2, "0");
      const c1 = match[4].padStart(2, "0");
      const c2 = match[5].padStart(3, "0");
      const tipoAbrev = match[6] ? match[6].toUpperCase() : null;

      const bloqueNumerico = `${muni}-${mod}-${c1}-${c2}`; // manteniéndolo como en la BBDD para no romper

      return {
        numeroAutorizacion,
        bloqueNumerico,
        municipioNum: parseInt(muni, 10),
        modalidadNum: parseInt(mod, 10),
        consecutivo1: c1,
        consecutivo2: c2,
        tipoAbrev,
        nombreOriginal: nombreArchivo,
      };
    } catch (error) {
      throw new Error(
        `Error parseando archivo ${nombreArchivo}: ${error.message}`,
      );
    }
  }

  // services/carga-masiva.service.js
  // services/carga-masiva.service.js
  // En el método buscarOCrearAutorizacion:
  async buscarOCrearAutorizacion(datosArchivo, userId) {
    console.log(datosArchivo);
    console.log("datosArchivo");

    const transaction = await this.autorizacionModel.sequelize.transaction();

    try {
      // Buscar municipio por número
      const municipio = await this.municipioModel.findOne({
        where: { num: datosArchivo.municipioNum },
      });

      if (!municipio) {
        throw new Error(
          `Municipio con número ${datosArchivo.municipioNum} no encontrado`,
        );
      }

      // Buscar modalidad por número
      const modalidad = await this.modalidadModel.findOne({
        where: { num: datosArchivo.modalidadNum },
      });

      if (!modalidad) {
        throw new Error(
          `Modalidad con número ${datosArchivo.modalidadNum} no encontrada`,
        );
      }

      // Buscar tipo de autorización por abreviatura
      const tipoAutorizacion = await this.tiposAutorizacionModel.findOne({
        where: { abreviatura: datosArchivo.tipoAbrev },
      });

      if (!tipoAutorizacion) {
        throw new Error(
          `Tipo de autorización con abreviatura ${datosArchivo.tipoAbrev} no encontrado`,
        );
      }

      // **MODIFICACIÓN: Buscar autorización por la combinación de datos**
      let autorizacion = await this.autorizacionModel.findOne({
        where: {
          municipioId: municipio.id,
          modalidadId: modalidad.id,
          tipoId: tipoAutorizacion.id,
          consecutivo1: datosArchivo.consecutivo1,
          consecutivo2: datosArchivo.consecutivo2,
        },
        transaction,
      });

      if (!autorizacion) {
        try {
          autorizacion = await this.autorizacionModel.create(
            {
              // No pasar numeroAutorizacion - dejar que el trigger lo genere
              numeroAutorizacion: datosArchivo.numeroAutorizacion,
              municipioId: municipio.id,
              modalidadId: modalidad.id,
              tipoId: tipoAutorizacion.id,
              consecutivo1: datosArchivo.consecutivo1,
              consecutivo2: datosArchivo.consecutivo2,
              activo: true,
              fechaCreacion: new Date(),
              fechaSolicitud: new Date(),
            },
            {
              transaction,
              returning: true, // Asegurar que devuelva el registro creado
            },
          );
        } catch (createError) {
          // Si falla por trigger, intentar buscar de nuevo
          if (createError.name === "SequelizeUniqueConstraintError") {
            autorizacion = await this.autorizacionModel.findOne({
              where: {
                municipioId: municipio.id,
                modalidadId: modalidad.id,
                tipoId: tipoAutorizacion.id,
                consecutivo1: datosArchivo.consecutivo1,
                consecutivo2: datosArchivo.consecutivo2,
              },
              transaction,
            });

            if (!autorizacion) {
              throw createError;
            }
          } else {
            throw createError;
          }
        }
      }

      await transaction.commit();
      return { autorizacion, municipio, modalidad, tipoAutorizacion };
    } catch (error) {
      await transaction.rollback();
      console.error("Error en buscarOCrearAutorizacion:", error);
      throw error;
    }
  }
  // Generar nombre de carpeta según función PostgreSQL
  generarNombreCarpeta(
    numeroAutorizacion,
    municipioNum,
    modalidadNum,
    consecutivo1,
    consecutivo2,
    tipoAbrev,
  ) {
    return [
      numeroAutorizacion,
      municipioNum.toString().padStart(2, "0"),
      modalidadNum.toString().padStart(2, "0"),
      consecutivo1.toString().padStart(4, "0"),
      consecutivo2.toString().padStart(4, "0"),
      tipoAbrev,
    ].join("_");
  }

  // Procesar archivo individual
  async procesarArchivoMasivo(
    archivoData,
    autorizacionInfo,
    userId,
    opciones = {},
  ) {
    const { useOcr = false } = opciones;
    const transaction = await this.documentoModel.sequelize.transaction();

    try {
      const { autorizacion, municipio, tipoAutorizacion } = autorizacionInfo;

      // Determinar si procesamos con OCR
      let bufferFinal = archivoData.buffer;
      let textoOCR = null;
      let estadoOCR = useOcr ? "pendiente" : "no_aplica";

      if (useOcr) {
        estadoOCR = "procesando";
        // Procesar con OCR
        const resultadoOCR = await OCRProcessorService.procesarPDFConOCR(
          archivoData.buffer,
          archivoData.nombre,
        );

        if (resultadoOCR.success) {
          bufferFinal = resultadoOCR.pdfBuffer;
          textoOCR = resultadoOCR.text;
          estadoOCR = "completado";
        } else {
          estadoOCR = "fallido";
          // Puedes decidir si continuar sin OCR o fallar
          console.warn(
            `OCR falló para ${archivoData.nombre}: ${resultadoOCR.error}`,
          );
        }
      }

      // Buscar si ya existe documento para esta autorización
      const documentoExistente = await this.documentoModel.findOne({
        where: {
          autorizacionId: autorizacion.id,
          version_actual: true,
        },
        transaction,
      });

      // Crear estructura de carpetas
      const estructura = this.construirEstructuraCarpetasNumericos({
        municipio: { id: municipio.num },
        tipoAutorizacion: {
          id: tipoAutorizacion.id,
          abreviatura: tipoAutorizacion.abreviatura,
        },
        numero: autorizacion.numeroAutorizacion,
        consecutivo: autorizacion.consecutivo1,
        nombreCarpeta: autorizacion.nombreCarpeta,
      });

      // Crear carpetas
      await this.crearEstructuraCarpetas(estructura.rutaCompleta);

      // Generar nombre de archivo
      const version = documentoExistente ? documentoExistente.version + 1 : 1;
      const nombreArchivo = this.generarNombreArchivoMasivo(
        autorizacion,
        archivoData.nombre,
        version,
      );

      const rutaArchivo = path.join(estructura.rutaCompleta, nombreArchivo);

      // Guardar archivo físicamente (con OCR aplicado si corresponde)
      await fs.writeFile(rutaArchivo, bufferFinal);

      // NUEVO: Notificar a Python sobre la nueva ruta
      // const pdfIdParaPython = nombreArchivo.replace(/\.pdf$/i, "");
      // OCRProcessorService.actualizarRutaFinal(
      //   pdfIdParaPython,
      //   rutaArchivo,
      // ).catch(console.error);

      // Calcular checksums del archivo final
      const checksumMd5 = crypto
        .createHash("md5")
        .update(bufferFinal)
        .digest("hex");
      const checksumSha256 = crypto
        .createHash("sha256")
        .update(bufferFinal)
        .digest("hex");

      // Si existe documento anterior, marcarlo como no actual
      if (documentoExistente) {
        await documentoExistente.update(
          { version_actual: false },
          { transaction },
        );
      }

      // Crear nuevo documento
      const nuevoDocumento = await this.documentoModel.create(
        {
          autorizacionId: autorizacion.id,
          titulo: `Documento de autorización ${autorizacion.numeroAutorizacion}`,
          descripcion: `Documento cargado masivamente: ${archivoData.nombreOriginal}`,
          version: version,
          version_actual: true,
          documentoPadreId: documentoExistente ? documentoExistente.id : null,
          estadoDigitalizacion: "digitalizado",
          paginas: this.estimarPaginas(bufferFinal),
          creadoPor: userId,
        },
        { transaction },
      );

      // Crear registro de archivo digital
      const archivoDigital = await this.archivoDigitalModel.create(
        {
          documento_id: nuevoDocumento.id,
          nombre_archivo: nombreArchivo,
          ruta_almacenamiento: path.join(
            estructura.rutaRelativa,
            nombreArchivo,
          ),
          mime_type: "application/pdf",
          tamano_bytes: bufferFinal.length,
          checksum_md5: checksumMd5,
          checksum_sha256: checksumSha256,
          estado_ocr: estadoOCR,
          texto_ocr: textoOCR, // NUEVO: guardar texto extraído
          fecha_digitalizacion: new Date(),
          digitalizado_por: userId,
          version_archivo: version,
          total_paginas: this.estimarPaginas(bufferFinal),
        },
        { transaction },
      );

      // // Si hay texto OCR, puedes también guardarlo en una tabla separada
      // if (textoOCR) {
      //     await this.guardarTextoOCR(nuevoDocumento.id, textoOCR, transaction);
      // }

      await transaction.commit();

      return {
        autorizacionId: autorizacion.id,
        numeroAutorizacion: autorizacion.numeroAutorizacion,
        documentoId: nuevoDocumento.id,
        version: version,
        archivo: nombreArchivo,
        ocrAplicado: useOcr,
        estadoOCR: estadoOCR,
        exito: true,
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
  /**
   * Guardar texto OCR en tabla separada (opcional)
   */
  async guardarTextoOCR(documentoId, texto, transaction) {
    // Puedes crear una tabla TextoOCR o usar la existente
    // Ejemplo: await TextoOCR.create({ documentoId, texto }, { transaction });
  }
  // Construir estructura de carpetas (igual que en DocumentoService)
  construirEstructuraCarpetasNumericos(autorizacion) {
    const municipioId = String(autorizacion.municipio.id).padStart(2, "0");
    const tipoAutorizacionId = String(
      autorizacion.tipoAutorizacion.id,
    ).padStart(2, "0");
    const carpetaAutorizacion = autorizacion.nombreCarpeta;

    const rutaRelativa = path.join(
      municipioId,
      tipoAutorizacionId,
      carpetaAutorizacion,
    );

    const basePath = process.env.FILE_STORAGE_PATH || "./storage";
    const rutaCompleta = path.join(basePath, rutaRelativa);

    return { rutaRelativa, rutaCompleta, carpetaAutorizacion };
  }

  async crearEstructuraCarpetas(ruta) {
    try {
      await fs.mkdir(ruta, { recursive: true });
    } catch (error) {
      throw new Error(`Error al crear carpetas: ${error.message}`);
    }
  }

  generarNombreArchivoMasivo(autorizacion, nombreOriginal, version) {
    const extension = path.extname(nombreOriginal);
    const timestamp = Date.now();

    // Extraer componentes para asegurar el formato de puros guiones bajo
    // nombreCarpeta contiene los verdaderos números ej "47" en lugar de su ID relacional ej "1".
    let nombreBase = "auth_desconocido";
    if (autorizacion.nombreCarpeta) {
      // Convertir cualquier espacio o guión en guión bajo: Ej "7365 04-11-07-001 C" -> "7365_04_11_07_001_C"
      nombreBase = autorizacion.nombreCarpeta.replace(/[\s-]/g, "_");
    } else {
      nombreBase = `auth_${autorizacion.id || "err"}`;
    }

    return `${nombreBase}_v${version}_${timestamp}${extension}`;
  }

  estimarPaginas(buffer) {
    const texto = buffer.toString("latin1");
    const matches = texto.match(/\/Type\s*\/Page\b/g);
    return matches ? matches.length : 1;
  }

  // Método principal para procesar carga masiva
  // async procesarCargaMasiva(archivos, userId, opciones = {}) {
  //     const { useOcr = false, loteSize = 5 } = opciones; // Reducir loteSize para OCR

  //     try {
  //         const resultados = {
  //             total: archivos.length,
  //             exitosos: 0,
  //             fallidos: 0,
  //             conOCR: useOcr,
  //             detalles: []
  //         };

  //         // Para OCR, procesar secuencialmente o en lotes pequeños
  //         if (useOcr) {
  //             // Procesar uno por uno para no saturar Python
  //             for (const archivo of archivos) {
  //                 try {
  //                     const datosArchivo = this.parsearNombreArchivo(archivo.nombre);
  //                     const autorizacionInfo = await this.buscarOCrearAutorizacion(datosArchivo, userId);

  //                     const resultado = await this.procesarArchivoMasivo(
  //                         { ...archivo, nombreOriginal: datosArchivo.nombreOriginal },
  //                         autorizacionInfo,
  //                         userId,
  //                         { useOcr: true } // Pasar opción de OCR
  //                     );

  //                     resultados.exitosos++;
  //                     resultados.detalles.push({
  //                         archivo: archivo.nombre,
  //                         exito: true,
  //                         ...resultado
  //                     });
  //                 } catch (error) {
  //                     resultados.fallidos++;
  //                     resultados.detalles.push({
  //                         archivo: archivo.nombre,
  //                         exito: false,
  //                         error: error.message
  //                     });
  //                 }
  //             }
  //         } else {
  //             // Procesamiento normal en lotes paralelos
  //             for (let i = 0; i < archivos.length; i += loteSize) {
  //                 const lote = archivos.slice(i, i + loteSize);
  //                 const promesas = lote.map(async (archivo) => {
  //                     try {
  //                         // Parsear nombre del archivo
  //                         const datosArchivo = this.parsearNombreArchivo(archivo.nombre);

  //                         // Buscar o crear autorización
  //                         const autorizacionInfo = await this.buscarOCrearAutorizacion(datosArchivo, userId);

  //                         // Procesar archivo
  //                         const resultado = await this.procesarArchivoMasivo({
  //                             ...archivo,
  //                             nombreOriginal: datosArchivo.nombreOriginal
  //                         }, autorizacionInfo, userId);

  //                         resultados.exitosos++;
  //                         resultados.detalles.push({
  //                             archivo: archivo.nombre,
  //                             exito: true,
  //                             ...resultado
  //                         });
  //                     } catch (error) {
  //                         resultados.fallidos++;
  //                         resultados.detalles.push({
  //                             archivo: archivo.nombre,
  //                             exito: false,
  //                             error: error.message
  //                         });
  //                     }
  //                 });
  //                 await Promise.all(promesas);
  //             }
  //         }

  //         return resultados;
  //     } catch (error) {
  //         throw new Error(`Error en carga masiva: ${error.message}`);
  //     }
  // }
  // se hixo esta versio  para rgistrear logf apesar de que es sin ocr

  async procesarCargaMasiva(archivos, userId, opciones = {}) {
    const {
      useOcr = false,
      loteSize = 5,
      loteId = null,
      origen = "DIRECTO",
    } = opciones; // Reducir loteSize para OCR

    try {
      const resultados = {
        total: archivos.length,
        exitosos: 0,
        fallidos: 0,
        conOCR: useOcr,
        detalles: [],
      };

      // Para OCR, procesar secuencialmente o en lotes pequeños
      if (useOcr) {
        // Procesar uno por uno para no saturar Python
        for (const archivo of archivos) {
          try {
            const datosArchivo = this.parsearNombreArchivo(archivo.nombre);
            const autorizacionInfo = await this.buscarOCrearAutorizacion(
              datosArchivo,
              userId,
            );

            const resultado = await this.procesarArchivoMasivo(
              { ...archivo, nombreOriginal: datosArchivo.nombreOriginal },
              autorizacionInfo,
              userId,
              { useOcr: true }, // Pasar opción de OCR
            );

            resultados.exitosos++;
            resultados.detalles.push({
              archivo: archivo.nombre,
              exito: true,
              ...resultado,
            });
          } catch (error) {
            resultados.fallidos++;
            resultados.detalles.push({
              archivo: archivo.nombre,
              exito: false,
              error: error.message,
            });
          }
        }
      } else {
        // Procesamiento normal en lotes paralelos
        for (let i = 0; i < archivos.length; i += loteSize) {
          const lote = archivos.slice(i, i + loteSize);
          const promesas = lote.map(async (archivo) => {
            let proceso = null; // importante para poder actualizarlo en catch

            try {
              // Parsear nombre del archivo
              const datosArchivo = this.parsearNombreArchivo(archivo.nombre);

              // Buscar o crear autorización
              const autorizacionInfo = await this.buscarOCrearAutorizacion(
                datosArchivo,
                userId,
              );

              // ================================
              //  CREAR REGISTRO (ANTES DE PROCESAR)
              // ================================
              proceso = await this.ocrProcesoModel.create({
                lote_id: loteId || `lote_sync_${Date.now()}_${userId}`,
                archivo_id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                nombre_archivo: archivo.nombre,
                autorizacion_id: autorizacionInfo.autorizacion.id,
                user_id: userId,
                estado: "procesando",
                tipo_proceso: "NORMAL",
                origen: origen,
                metadata: {
                  useOcr,
                  tamano: archivo.tamano,
                },
              });

              // ================================
              //  PROCESAR ARCHIVO
              // ================================
              const resultado = await this.procesarArchivoMasivo(
                {
                  ...archivo,
                  nombreOriginal: datosArchivo.nombreOriginal,
                },
                autorizacionInfo,
                userId,
              );

              // ================================
              //  ACTUALIZAR A COMPLETADO
              // ================================
              await proceso.update({
                estado: "completado",
                documento_id: resultado.documentoId,
                fecha_procesado: new Date(),
              });

              resultados.exitosos++;
              resultados.detalles.push({
                archivo: archivo.nombre,
                exito: true,
                ...resultado,
              });
            } catch (error) {
              // ================================
              //  ACTUALIZAR A FALLADO
              // ================================
              if (proceso) {
                await proceso.update({
                  estado: "fallado",
                  error: error.message,
                });
              }

              resultados.fallidos++;
              resultados.detalles.push({
                archivo: archivo.nombre,
                exito: false,
                error: error.message,
              });
            }
          });

          await Promise.all(promesas);
        }
      }

      return resultados;
    } catch (error) {
      throw new Error(`Error en carga masiva: ${error.message}`);
    }
  }

  // Método para recibir archivos directamente (no comprimidos)
  async procesarArchivosDirectos(archivos, userId, opciones = {}) {
    const archivosProcesados = archivos.map((archivo) => ({
      nombre: archivo.originalname,
      buffer: archivo.buffer,
      tamano: archivo.size,
    }));

    return await this.procesarCargaMasiva(archivosProcesados, userId, opciones);
  }
  /**
   * Iniciar procesamiento OCR asíncrono para archivo comprimido
   */
  async iniciarProcesamientoOCRAsincrono(
    archivoBuffer,
    extension,
    userId,
    loteId,
  ) {
    try {
      // Extraer archivos del comprimido
      const archivos = await this.extraerArchivosComprimidos(
        archivoBuffer,
        extension,
      );

      if (archivos.length === 0) {
        throw new Error("No se encontraron archivos PDF en el comprimido");
      }

      // Crear registros de lote en la base de datos
      const procesos = [];

      for (const archivo of archivos) {
        try {
          // Parsear nombre para obtener datos de autorización
          const datosArchivo = this.parsearNombreArchivo(archivo.nombre);

          // Buscar o crear autorización (sin transacción larga)
          const autorizacionInfo = await this.buscarOCrearAutorizacionRapido(
            datosArchivo,
            userId,
          );

          // Crear registro de proceso OCR
          // const proceso = await this.ocrProcesoModel.create({
          //     loteId,
          //     archivoId: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          //     nombreArchivo: archivo.nombre,
          //     autorizacionId: autorizacionInfo.autorizacion.id,
          //     userId,
          //     estado: 'pendiente',
          //     metadata: {
          //         datosArchivo,
          //         tamano: archivo.tamano,
          //         rutaRelativa: archivo.rutaRelativa
          //     }
          // });

          const proceso = await this.ocrProcesoModel.create({
            lote_id: loteId,
            archivo_id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            nombre_archivo: archivo.nombre,
            autorizacion_id: autorizacionInfo.autorizacion.id,
            user_id: userId,
            estado: "pendiente",
            metadata: {
              datosArchivo,
              tamano: archivo.tamano,
              rutaRelativa: archivo.rutaRelativa,
            },
          });
          procesos.push(proceso);

          // Enviar a Python para OCR (en segundo plano)
          this.enviarArchivoParaOCR(
            archivo,
            proceso,
            autorizacionInfo,
            userId,
          ).catch((error) => {
            console.error(`Error procesando ${archivo.nombre}:`, error);
          });
        } catch (error) {
          console.error(`Error preparando ** ${archivo.nombre}:`, error);
          // Crear registro fallado
          await this.ocrProcesoModel.create({
            loteId,
            nombreArchivo: archivo.nombre,
            autorizacionId: null,
            userId,
            estado: "fallado",
            error: error.message,
            metadata: { error: true },
          });
        }
      }

      console.log(`Lote ${loteId} iniciado con ${procesos.length} archivos`);
      return { loteId, total: archivos.length, procesos: procesos.length };
    } catch (error) {
      console.error("Error iniciando procesamiento asíncrono:", error);
      throw error;
    }
  }

  /**
   * Versión rápida de buscarOCrearAutorizacion para OCR asíncrono
   */
  async buscarOCrearAutorizacionRapido(datosArchivo, userId) {
    console.log(datosArchivo);
    console.log(datosArchivo);
    console.log("###");
    console.log("###");
    try {
      const municipio = await this.municipioModel.findOne({
        where: { num: datosArchivo.municipioNum },
        attributes: ["id", "num"],
      });
      if (!municipio) {
        throw new Error(`Municipio ${datosArchivo.municipioNum} no encontrado`);
      }

      const modalidad = await this.modalidadModel.findOne({
        where: { num: datosArchivo.modalidadNum },
        attributes: ["id", "num"],
      });
      if (!modalidad) {
        throw new Error(`Modalidad ${datosArchivo.modalidadNum} no encontrada`);
      }

      const tipoAutorizacion = await this.tiposAutorizacionModel.findOne({
        where: { abreviatura: datosArchivo.tipoAbrev },
        attributes: ["id", "abreviatura"],
      });
      if (!tipoAutorizacion) {
        throw new Error(
          `Tipo autorización ${datosArchivo.tipoAbrev} no encontrado`,
        );
      }

      let autorizacion = await this.autorizacionModel.findOne({
        where: {
          municipioId: municipio.id,
          modalidadId: modalidad.id,
          tipoId: tipoAutorizacion.id,
          consecutivo1: datosArchivo.consecutivo1,
          consecutivo2: datosArchivo.consecutivo2,
        },
        attributes: ["id", "numeroAutorizacion", "nombreCarpeta"],
      });

      if (!autorizacion) {
        autorizacion = await this.autorizacionModel.create({
          numeroAutorizacion: datosArchivo.numeroAutorizacion, //
          municipioId: municipio.id,
          modalidadId: modalidad.id,
          tipoId: tipoAutorizacion.id,
          consecutivo1: datosArchivo.consecutivo1,
          consecutivo2: datosArchivo.consecutivo2,
          activo: true,
          fechaCreacion: new Date().toISOString().slice(0, 10),
          fechaSolicitud: new Date().toISOString().slice(0, 10),
        });
      }

      return {
        autorizacion,
        municipio,
        modalidad,
        tipoAutorizacion,
      };
    } catch (error) {
      console.error("Error en buscarOCrearAutorizacionRapido:", error);
      throw error;
    }
  }

  /**
   * Enviar archivo a Python para procesamiento OCR
   */
  async enviarArchivoParaOCR(archivoData, proceso, autorizacionInfo, userId) {
    try {
      // Actualizar estado a procesando
      await proceso.update({
        estado: "procesando",
        intentos: proceso.intentos + 1,
      });

      // Enviar a Python
      const envio = await OCRProcessorService.enviarPDFParaOCR(
        archivoData.buffer,
        archivoData.nombre,
      );

      if (!envio.success) {
        throw new Error(`Error enviando a Python: ${envio.error}`);
      }

      // Actualizar con ID de Python
      await proceso.update({
        archivoId: envio.pythonPdfId,
        metadata: {
          ...proceso.metadata,
          taskId: envio.taskId,
          pythonPdfId: envio.pythonPdfId,
        },
      });

      // Iniciar polling para verificar resultado
      this.monitorearProcesoOCR(proceso, autorizacionInfo, userId, archivoData);

      return { success: true, taskId: envio.taskId };
    } catch (error) {
      await proceso.update({
        estado:
          proceso.intentos >= proceso.maxIntentos ? "fallado" : "pendiente",
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Monitorear proceso OCR en Python
   */
  async monitorearProcesoOCR(proceso, autorizacionInfo, userId, archivoData) {
    const maxIntentosPolling = 60; // 60 intentos * 5 segundos = 5 minutos
    let intentos = 0;

    const intervalo = setInterval(async () => {
      try {
        intentos++;

        // **CORRECCIÓN 1: Verificar estado SIN loops internos**
        const estado = await OCRProcessorService.verificarEstadoOCRUnico(
          proceso.metadata.pythonPdfId,
          5000, // Timeout de 5 segundos
        );

        // Si Python responde con 'not found' o 404, seguir esperando
        if (
          estado.error?.includes("404") ||
          estado.error?.includes("not found")
        ) {
          console.log(
            `Esperando ${proceso.nombreArchivo}... (intento ${intentos})`,
          );

          if (intentos >= maxIntentosPolling) {
            clearInterval(intervalo);
            await proceso.update({
              estado:
                proceso.intentos >= proceso.maxIntentos
                  ? "fallado"
                  : "pendiente",
              error: "Timeout en procesamiento OCR",
            });
          }
          return;
        }

        if (estado.success && estado.status === "completed") {
          clearInterval(intervalo);

          // **CORRECCIÓN 2: Llamar sin transacción para descargas**
          await this.finalizarProcesoOCRExitoso(
            proceso,
            estado,
            autorizacionInfo,
            userId,
            archivoData,
          );
        } else if (!estado.success || intentos >= maxIntentosPolling) {
          clearInterval(intervalo);

          if (estado.status === "failed") {
            await proceso.update({
              estado: "fallado",
              error: estado.error,
            });
          } else if (intentos >= maxIntentosPolling) {
            // Timeout
            await proceso.update({
              estado:
                proceso.intentos >= proceso.maxIntentos
                  ? "fallado"
                  : "pendiente",
              error: estado.error || "Timeout en procesamiento OCR",
            });

            // Reintentar si aún tiene intentos
            if (proceso.intentos < proceso.maxIntentos) {
              setTimeout(() => {
                this.enviarArchivoParaOCR(
                  archivoData,
                  proceso,
                  autorizacionInfo,
                  userId,
                ).catch(console.error);
              }, 30000);
            }
          }
        }
      } catch (error) {
        console.error(`Error monitoreando ${proceso.nombreArchivo}:`, error);

        if (intentos >= maxIntentosPolling) {
          clearInterval(intervalo);
          await proceso.update({
            estado: "fallado",
            error: error.message,
          });
        }
      }
    }, 5000);
  }

  /**
   * Finalizar proceso OCR exitoso
   */
  async finalizarProcesoOCRExitoso(
    proceso,
    estado,
    autorizacionInfo,
    userId,
    archivoData,
  ) {
    try {
      // **CORRECCIÓN 1: Obtener pythonPdfId del estado**
      console.log("estado recibido:", estado);
      const pythonPdfId = estado.pythonPdfId;

      if (!pythonPdfId) {
        throw new Error("pythonPdfId no disponible en el estado");
      }

      // **CORRECCIÓN 2: Descargar resultados ANTES de abrir transacción**
      const [pdfResult, textResult] = await Promise.all([
        OCRProcessorService.descargarPDFConOCR(pythonPdfId),
        OCRProcessorService.descargarTextoOCR(pythonPdfId),
      ]);

      if (pdfResult.error || textResult.error) {
        if (
          pdfResult.error?.includes("404") ||
          textResult.error?.includes("404") ||
          pdfResult.error?.includes("202") ||
          textResult.error?.includes("202")
        ) {
          console.log(
            `Recursos aún no disponibles para ${proceso.nombreArchivo}, reintentando...`,
          );
          // Volver a poner en cola para verificación posterior
          // this.reprogramarVerificacion(proceso, autorizacionInfo, userId, archivoData);
          return { success: false, retry: true };
        }
        throw new Error(
          `Error descargando resultados: ${pdfResult.error || textResult.error}`,
        );
      }
      if (
        textResult?.text &&
        typeof textResult.text === "object" &&
        textResult.text.status === "pending"
      ) {
        console.log(
          `OCR aún procesándose (${textResult.text.progress || 0}%) para ${proceso.nombreArchivo}`,
        );
        return { success: false, retry: true };
      }
      // **CORRECCIÓN 3: Solo ahora abrir transacción para guardar en BD**
      const transaction = await this.documentoModel.sequelize.transaction();

      try {
        // Buscar si ya existe documento
        const documentoExistente = await this.documentoModel.findOne({
          where: {
            autorizacionId: autorizacionInfo.autorizacion.id,
            version_actual: true,
          },
          transaction,
        });

        // Crear estructura de carpetas
        const estructura = this.construirEstructuraCarpetasNumericos({
          municipio: { id: autorizacionInfo.municipio.num },
          tipoAutorizacion: {
            id: autorizacionInfo.tipoAutorizacion.id,
            abreviatura: autorizacionInfo.tipoAutorizacion.abreviatura,
          },
          numero: autorizacionInfo.autorizacion.numeroAutorizacion,
          consecutivo: autorizacionInfo.autorizacion.consecutivo1,
          nombreCarpeta: autorizacionInfo.autorizacion.nombreCarpeta,
        });

        // Crear carpetas
        await this.crearEstructuraCarpetas(estructura.rutaCompleta);

        // Generar nombre de archivo
        const version = documentoExistente ? documentoExistente.version + 1 : 1;
        const nombreArchivo = this.generarNombreArchivoMasivo(
          autorizacionInfo.autorizacion,
          archivoData.nombre,
          version,
        );

        const rutaArchivo = path.join(estructura.rutaCompleta, nombreArchivo);

        // Guardar archivo con OCR
        await fs.writeFile(rutaArchivo, pdfResult.pdfBuffer);

        // NUEVO: Notificar a Python sobre la nueva ruta
        // const pdfIdParaPython = nombreArchivo.replace(/\.pdf$/i, "");
        // OCRProcessorService.actualizarRutaFinal(
        //   pdfIdParaPython,
        //   rutaArchivo,
        // ).catch(console.error);

        // Opcional: También actualizar la UUID original para que el status task apunte correctamente
        OCRProcessorService.actualizarRutaFinal(pythonPdfId, rutaArchivo).catch(
          console.error,
        );

        // Calcular checksums
        const checksumMd5 = crypto
          .createHash("md5")
          .update(pdfResult.pdfBuffer)
          .digest("hex");
        const checksumSha256 = crypto
          .createHash("sha256")
          .update(pdfResult.pdfBuffer)
          .digest("hex");

        // Si existe documento anterior, marcarlo como no actual
        if (documentoExistente) {
          await documentoExistente.update(
            { version_actual: false },
            { transaction },
          );
        }

        // Crear nuevo documento
        const nuevoDocumento = await this.documentoModel.create(
          {
            autorizacionId: autorizacionInfo.autorizacion.id,
            titulo: `Documento con OCR ${autorizacionInfo.autorizacion.numeroAutorizacion}`,
            descripcion: `Documento procesado con OCR: ${archivoData.nombre}`,
            version: version,
            version_actual: true,
            documentoPadreId: documentoExistente ? documentoExistente.id : null,
            estadoDigitalizacion: "digitalizado",
            paginas: this.estimarPaginas(pdfResult.pdfBuffer),
            creadoPor: userId,
          },
          { transaction },
        );

        // Crear registro de archivo digital
        await this.archivoDigitalModel.create(
          {
            documento_id: nuevoDocumento.id,
            nombre_archivo: nombreArchivo,
            ruta_almacenamiento: path.join(
              estructura.rutaRelativa,
              nombreArchivo,
            ),
            mime_type: "application/pdf",
            tamano_bytes: pdfResult.pdfBuffer.length,
            checksum_md5: checksumMd5,
            checksum_sha256: checksumSha256,
            estado_ocr: "completado",
            texto_ocr: textResult.text,
            fecha_digitalizacion: new Date(),
            digitalizado_por: userId,
            version_archivo: version,
            total_paginas: this.estimarPaginas(pdfResult.pdfBuffer),
          },
          { transaction },
        );

        // Actualizar proceso OCR
        await proceso.update(
          {
            estado: "completado",
            documentoId: nuevoDocumento.id,
            fechaProcesado: new Date(),
            metadata: {
              ...proceso.metadata,
              documentoId: nuevoDocumento.id,
              rutaArchivo: rutaArchivo,
            },
          },
          { transaction },
        );

        await transaction.commit();
        const nombreLog =
          proceso.nombreArchivo ||
          proceso.nombre_archivo ||
          proceso.archivo_id ||
          "[sin-nombre]";
        console.log(`Proceso OCR completado: ${nombreLog}`);
        return { success: true, documentoId: nuevoDocumento.id };
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      console.error(`Error finalizando OCR ${proceso.nombreArchivo}:`, error);

      // Actualizar proceso con error
      await proceso.update({
        estado: "fallado",
        error: error.message,
        intentos: proceso.intentos + 1,
      });

      throw error;
    }
  }

  /**
   * Obtener estado de un lote OCR
   */
  async obtenerEstadoLoteOCR(loteId, userId) {
    const procesos = await this.ocrProcesoModel.findAll({
      where: { loteId, userId },
      attributes: ["estado", "createdAt"],
    });

    const conteo = procesos.reduce((acc, proceso) => {
      acc[proceso.estado] = (acc[proceso.estado] || 0) + 1;
      return acc;
    }, {});

    return {
      total: procesos.length,
      conteo,
      completado: conteo.completado || 0,
      pendiente: conteo.pendiente || 0,
      procesando: conteo.procesando || 0,
      fallado: conteo.fallado || 0,
      porcentaje:
        procesos.length > 0
          ? Math.round(((conteo.completado || 0) / procesos.length) * 100)
          : 0,
    };
  }

  /**
   * Obtener resultados detallados de un lote OCR
   */
  async obtenerResultadosLoteOCR(loteId, userId) {
    const procesos = await this.ocrProcesoModel.findAll({
      where: { loteId, userId },
      include: [
        {
          model: this.documentoModel,
          as: "documento",
          attributes: ["id", "version", "titulo"],
        },
        {
          model: this.autorizacionModel,
          as: "autorizacion",
          attributes: ["id", "numeroAutorizacion"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const resultados = procesos.map((proceso) => ({
      nombreArchivo: proceso.nombreArchivo,
      estado: proceso.estado,
      error: proceso.error,
      documentoId: proceso.documentoId,
      autorizacionId: proceso.autorizacionId,
      numeroAutorizacion: proceso.autorizacion
        ? proceso.autorizacion.numeroAutorizacion
        : null,
      intentos: proceso.intentos,
      fechaCreacion: proceso.createdAt,
      fechaProcesado: proceso.fechaProcesado,
    }));

    const conteo = procesos.reduce((acc, proceso) => {
      acc[proceso.estado] = (acc[proceso.estado] || 0) + 1;
      return acc;
    }, {});

    return {
      total: procesos.length,
      conteo,
      resultados,
      todosCompletados: (conteo.completado || 0) === procesos.length,
      tieneErrores: (conteo.fallado || 0) > 0,
    };
  }

  /**
   * Listar lotes por usuario
   */
  async listarLotesPorUsuario(userId, limit = 20, offset = 0) {
    const { fn, col, literal } = this.ocrProcesoModel.sequelize;

    await this.reconciliarProcesosOCRPendientes(userId);
    const pythonResponse = await OCRProcessorService.listarProcesos();
    const pdfs = pythonResponse.pdfs || [];
    const lotes = await this.ocrProcesoModel.findAll({
      where: { user_id: userId },
      attributes: [
        ["lote_id", "loteId"],
        ["tipo_proceso", "tipoProceso"],
        ["origen", "origen"],

        [fn("COUNT", col("id")), "totalArchivos"],

        [
          fn(
            "SUM",
            literal(`CASE WHEN estado = 'completado' THEN 1 ELSE 0 END`),
          ),
          "completados",
        ],

        [
          fn("SUM", literal(`CASE WHEN estado = 'fallado' THEN 1 ELSE 0 END`)),
          "fallados",
        ],

        [
          fn(
            "ARRAY_AGG",
            literal(`CASE WHEN estado = 'fallado' THEN error ELSE NULL END`),
          ),
          "errores",
        ],

        [
          fn(
            "JSON_AGG",
            literal(`
                        CASE 
                            WHEN estado = 'completado' THEN
                                json_build_object(
                                    'nombreArchivo', nombre_archivo,
                                    'documentoId', documento_id,
                                    'metadata', metadata,
                                    'fechaProcesado', fecha_procesado
                                )
                            ELSE NULL
                        END
                    `),
          ),
          "archivosProcesados",
        ],

        [fn("MAX", col("created_at")), "ultimoProceso"],
      ],

      group: ["lote_id", "tipo_proceso", "origen"], //  IMPORTANTE
      order: [[literal('"ultimoProceso"'), "DESC"]],
      limit,
      offset,
      raw: true,
    });
    return lotes.map((lote) => {
      // Usar los PDFs del lote que Python conoce
      const procesosDelLote = pdfs.filter(
        (p) =>
          p.task_id &&
          lote.archivosProcesados
            ?.map((a) => a?.metadata?.taskId)
            .includes(p.task_id),
      );

      // PDFs actualmente procesándose
      // Solo para este lote
      const procesosEnCurso = pdfs.filter(
        (p) =>
          p.task_id &&
          p.status === "processing" &&
          lote.archivosProcesados
            ?.map((a) => a?.metadata?.taskId)
            .includes(p.task_id),
      );

      const todosProcesos = [...procesosDelLote, ...procesosEnCurso];

      const numCompleted = Number(lote.completados) || 0;
      const sumProgressEnCurso = procesosEnCurso.reduce(
        (acc, p) => acc + (p.progress || 0),
        0,
      );
      const totalConocidosParaProgreso = numCompleted + procesosEnCurso.length;

      const progresoPromedio =
        totalConocidosParaProgreso > 0
          ? Math.round(
              (numCompleted * 100 + sumProgressEnCurso) /
                (numCompleted + todosProcesos.length),
            )
          : 0;

      const paginasTotales = todosProcesos.reduce(
        (acc, p) => acc + (p.pages || 0),
        0,
      );

      const porcentajeFinal =
        lote.totalArchivos > 0
          ? Math.round((lote.completados / lote.totalArchivos) * 100)
          : progresoPromedio;

      return {
        loteId: lote.loteId,
        tipoProceso: lote.tipoProceso,
        origen: lote.origen,

        totalArchivos: Number(lote.totalArchivos),
        completados: Number(lote.completados),
        fallados: Number(lote.fallados),

        porcentaje: porcentajeFinal,

        progresoOCR: progresoPromedio,
        paginasTotales,

        errores: (lote.errores || []).filter(Boolean),
        archivosProcesados: (lote.archivosProcesados || []).filter(Boolean),
        ultimoProceso: lote.ultimoProceso,
      };
    });
    // return lotes.map(lote => ({
    //     loteId: lote.loteId,
    //     tipoProceso: lote.tipoProceso,
    //     origen: lote.origen,

    //     totalArchivos: Number(lote.totalArchivos),
    //     completados: Number(lote.completados),
    //     fallados: Number(lote.fallados),

    //     porcentaje: lote.totalArchivos > 0
    //         ? Math.round((lote.completados / lote.totalArchivos) * 100)
    //         : 0,

    //     errores: (lote.errores || []).filter(Boolean),
    //     archivosProcesados: (lote.archivosProcesados || []).filter(Boolean),
    //     ultimoProceso: lote.ultimoProceso
    // }));
  }

  // async listarLotesPorUsuario(userId, limit = 20, offset = 0) {
  //     const { fn, col, literal } = this.ocrProcesoModel.sequelize;

  //     await this.reconciliarProcesosOCRPendientes(userId);

  //     const lotes = await this.ocrProcesoModel.findAll({
  //         where: { user_id: userId },
  //         attributes: [
  //             ['lote_id', 'loteId'],
  //             [fn('COUNT', col('id')), 'totalArchivos'],
  //             [fn('SUM', literal(`CASE WHEN estado = 'completado' THEN 1 ELSE 0 END`)), 'completados'],
  //             [fn('SUM', literal(`CASE WHEN estado = 'fallado' THEN 1 ELSE 0 END`)), 'fallados'],
  //             [
  //                 fn(
  //                     'ARRAY_AGG',
  //                     literal(`CASE WHEN estado = 'fallado' THEN error ELSE NULL END`)
  //                 ),
  //                 'errores'
  //             ],
  //             [
  //                 fn(
  //                     'JSON_AGG',
  //                     literal(`
  //                 CASE
  //                     WHEN estado = 'completado' THEN
  //                     json_build_object(
  //                         'nombreArchivo', nombre_archivo,
  //                         'documentoId', documento_id,
  //                         'metadata', metadata,
  //                         'fechaProcesado', fecha_procesado
  //                     )
  //                     ELSE NULL
  //                 END
  //                 `)
  //                 ),
  //                 'archivosProcesados'
  //             ],
  //             [fn('MAX', col('created_at')), 'ultimoProceso']
  //         ],
  //         group: ['lote_id'],
  //         order: [[literal('"ultimoProceso"'), 'DESC']],
  //         raw: true
  //     });

  //     return lotes.map(lote => ({
  //         loteId: lote.loteId,
  //         totalArchivos: Number(lote.totalArchivos),
  //         completados: Number(lote.completados),
  //         fallados: Number(lote.fallados),
  //         porcentaje: lote.totalArchivos > 0
  //             ? Math.round((lote.completados / lote.totalArchivos) * 100)
  //             : 0,
  //         errores: (lote.errores || []).filter(Boolean),
  //         archivosProcesados: (lote.archivosProcesados || []).filter(Boolean),
  //         ultimoProceso: lote.ultimoProceso
  //     }));

  // }

  /**
   * Iniciar procesamiento directo OCR asíncrono
   */
  async iniciarProcesamientoDirectoOCRAsincrono(archivos, userId, loteId) {
    try {
      const procesos = [];

      for (const archivo of archivos) {
        let autorizacionInfo = null;

        try {
          const datosArchivo = this.parsearNombreArchivo(archivo.originalname);

          autorizacionInfo = await this.buscarOCrearAutorizacionRapido(
            datosArchivo,
            userId,
          );

          const proceso = await this.ocrProcesoModel.create({
            lote_id: loteId,
            archivo_id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            nombre_archivo: archivo.originalname,
            autorizacion_id: autorizacionInfo.autorizacion.id,
            user_id: userId,
            estado: "pendiente",
            metadata: {
              datosArchivo,
              tamano: archivo.size,
            },
          });

          procesos.push(proceso);

          this.enviarArchivoParaOCR(
            {
              buffer: archivo.buffer,
              nombre: archivo.originalname,
              tamano: archivo.size,
            },
            proceso,
            autorizacionInfo,
            userId,
          ).catch((err) =>
            console.error(`Error procesando ${archivo.originalname}:`, err),
          );
        } catch (error) {
          console.error(`Error preparando ### ${archivo.originalname}:`, error);

          await this.ocrProcesoModel.create({
            lote_id: loteId,
            archivo_id: `error_${Date.now()}`,
            nombre_archivo: archivo.originalname,
            autorizacion_id: autorizacionInfo?.autorizacion?.id ?? 0,
            user_id: userId,
            estado: "fallado",
            error: error.message,
            metadata: { error: true },
          });
        }
      }

      console.log(
        `Lote directo ${loteId} iniciado con ${procesos.length} archivos`,
      );
      return { loteId, total: archivos.length, procesos: procesos.length };
    } catch (error) {
      console.error("Error iniciando procesamiento directo asíncrono:", error);
      throw error;
    }
  }

  /**
   * Reprogramar verificación para más tarde
   */
  reprogramarVerificacion(proceso, autorizacionInfo, userId, archivoData) {
    setTimeout(async () => {
      try {
        // Verificar estado nuevamente
        const estado = await OCRProcessorService.verificarEstadoOCRUnico(
          proceso.metadata.pythonPdfId,
        );

        if (estado.success && estado.status === "completed") {
          await this.finalizarProcesoOCRExitoso(
            proceso,
            estado,
            autorizacionInfo,
            userId,
            archivoData,
          );
        }
      } catch (error) {
        console.error(`Error en verificación reprogramada: ${error.message}`);
      }
    }, 10000); // Esperar 10 segundos
  }

  async reconciliarProcesosOCRPendientes(userId) {
    const pendientes = await this.ocrProcesoModel.findAll({
      where: {
        user_id: userId,
        estado: { [Op.in]: ["pendiente", "procesando"] },
      },
    });

    if (!pendientes.length) return;

    // Una sola llamada a Python
    const response = await OCRProcessorService.listarProcesos();
    const pdfs = response.pdfs || [];

    for (const proceso of pendientes) {
      const taskId = proceso.metadata?.taskId;
      if (!taskId) continue;

      const task = pdfs.find((p) => p.task_id === taskId);
      if (!task || task.status !== "completed") continue;

      console.log("proceso");
      console.log(proceso);
      await this.finalizarProcesoOCRExitoso(
        proceso,
        {
          success: true,
          status: "completed",
          pythonPdfId: task.id,
        },
        await this.obtenerAutorizacionInfoDesdeProceso(proceso),
        proceso.user_id,
        { nombre: proceso.nombre_archivo },
      );
    }
  }
  /**
   * Reconstruir autorizacionInfo desde un proceso OCR
   * (sin depender del flujo original en memoria)
   */
  async obtenerAutorizacionInfoDesdeProceso(proceso) {
    if (!proceso.autorizacion_id) {
      throw new Error("El proceso OCR no tiene autorizacion_id");
    }

    // Autorización base
    const autorizacion = await this.autorizacionModel.findByPk(
      proceso.autorizacion_id,
      {
        attributes: [
          "id",
          "numeroAutorizacion",
          "nombreCarpeta",
          "consecutivo1",
          "municipioId",
          "tipoId",
        ],
      },
    );

    if (!autorizacion) {
      throw new Error(`Autorización ${proceso.autorizacion_id} no encontrada`);
    }

    // Municipio
    const municipio = await this.municipioModel.findByPk(
      autorizacion.municipioId,
      {
        attributes: ["id", "num"],
      },
    );

    if (!municipio) {
      throw new Error("Municipio no encontrado para la autorización");
    }

    // Tipo de autorización
    const tipoAutorizacion = await this.tiposAutorizacionModel.findByPk(
      autorizacion.tipoId,
      {
        attributes: ["id", "abreviatura"],
      },
    );

    if (!tipoAutorizacion) {
      throw new Error("Tipo de autorización no encontrado");
    }

    return {
      autorizacion,
      municipio,
      tipoAutorizacion,
    };
  }
}

module.exports = new CargaMasivaService();
