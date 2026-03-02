// services/carga-masiva.service.js
const AdmZip = require('adm-zip');
const fs = require('fs').promises;
const path = require('path');

const Autorizacion = require('../../explorer/models/autorizacion.model');
const Municipio = require('../../municipios/models/municipio.model');
const Modalidad = require('../../explorer/models/Modalidad.model');
const TiposAutorizacion = require('../../explorer/models/TiposAutorizacion.model');
const Documento = require('../../explorer/models/documento.model');
const ArchivoDigital = require('../../explorer/models/archivo-digital.model');
const User = require('../../users/models/user.model');

const crypto = require('crypto');
const { Op } = require('sequelize');

const OCRProcessorService = require('./ocr-processor.service');
const OCRProceso = require('../../digitalizacion/models/ocr-proceso.model');

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
            const tempDir = path.join(process.cwd(), 'temp', Date.now().toString());
            await fs.mkdir(tempDir, { recursive: true });

            if (extension === '.zip') {
                const zip = new AdmZip(archivoBuffer);
                zip.extractAllTo(tempDir, true);
            } else if (extension === '.rar') {
                throw new Error('Formato RAR no soportado actualmente');
            }

            const leerCarpetasRecursivamente = async (dir, basePath = '') => {
                const items = await fs.readdir(dir, { withFileTypes: true });

                for (const item of items) {
                    const fullPath = path.join(dir, item.name);
                    const relativePath = path.join(basePath, item.name);

                    if (item.isDirectory()) {
                        await leerCarpetasRecursivamente(fullPath, relativePath);
                    } else if (item.isFile() && item.name.toLowerCase().endsWith('.pdf')) {
                        const buffer = await fs.readFile(fullPath);

                        // Nomenclatura oficial
                        const match = item.name.match(/^(\d+)\s+(\d+)-(\d+)-(\d+)-(\d+)\s+([CP])/i);
                        if (!match) {
                            archivos.push({
                                nombre: item.name,
                                buffer,
                                rutaRelativa: path.join(basePath, item.name),
                                tamano: buffer.length,
                                extension: path.extname(item.name),
                                errorNomenclatura: true
                            });
                        } else {
                            const nombreLimpio = `${match[0]}.pdf`;
                            archivos.push({
                                nombre: nombreLimpio,
                                buffer,
                                rutaRelativa: path.join(basePath, nombreLimpio),
                                tamano: buffer.length,
                                extension: path.extname(item.name)
                            });
                        }
                    }
                }
            };

            await leerCarpetasRecursivamente(tempDir);
            await fs.rm(tempDir, { recursive: true, force: true });

            return archivos;
        } catch (error) {
            throw new Error(`Error al extraer archivos: ${error.message}`);
        }
    }

    parsearNombreArchivo(nombreArchivo) {
        try {
            const nombreSinExtension = nombreArchivo.replace(/\.pdf$/i, '');
            const nombreSinPaginas = nombreSinExtension.replace(/\s*\(\d+\s*(pag\.?)?\)$/i, '');
            const partes = nombreSinPaginas.split(/\s+/);

            if (partes.length < 2) throw new Error(`Formato de nombre inválido: ${nombreArchivo}`);

            const numeroAutorizacion = partes[0];
            const bloqueNumerico = partes[1];
            const tipoAbrev = partes.length >= 3 ? partes[2].toUpperCase() : null;

            const componentes = bloqueNumerico.split('-');
            if (componentes.length !== 4) throw new Error(`Bloque numérico inválido: ${bloqueNumerico}`);

            return {
                numeroAutorizacion,
                bloqueNumerico,
                municipioNum: parseInt(componentes[0]),
                modalidadNum: parseInt(componentes[1]),
                consecutivo1: componentes[2],
                consecutivo2: componentes[3],
                tipoAbrev,
                nombreOriginal: nombreArchivo
            };
        } catch (error) {
            throw new Error(`Error parseando archivo ${nombreArchivo}: ${error.message}`);
        }
    }

    async buscarOCrearAutorizacion(datosArchivo, userId) {
        const transaction = await this.autorizacionModel.sequelize.transaction();
        try {
            const municipio = await this.municipioModel.findOne({ where: { num: datosArchivo.municipioNum } });
            if (!municipio) throw new Error(`Municipio con número ${datosArchivo.municipioNum} no encontrado`);

            const modalidad = await this.modalidadModel.findOne({ where: { num: datosArchivo.modalidadNum } });
            if (!modalidad) throw new Error(`Modalidad con número ${datosArchivo.modalidadNum} no encontrada`);

            const tipoAutorizacion = await this.tiposAutorizacionModel.findOne({ where: { abreviatura: datosArchivo.tipoAbrev } });
            if (!tipoAutorizacion) throw new Error(`Tipo de autorización con abreviatura ${datosArchivo.tipoAbrev} no encontrado`);

            let autorizacion = await this.autorizacionModel.findOne({
                where: {
                    municipioId: municipio.id,
                    modalidadId: modalidad.id,
                    tipoId: tipoAutorizacion.id,
                    consecutivo1: datosArchivo.consecutivo1,
                    consecutivo2: datosArchivo.consecutivo2
                },
                transaction
            });

            if (!autorizacion) {
                try {
                    autorizacion = await this.autorizacionModel.create({
                        numeroAutorizacion: datosArchivo.numeroAutorizacion,
                        municipioId: municipio.id,
                        modalidadId: modalidad.id,
                        tipoId: tipoAutorizacion.id,
                        consecutivo1: datosArchivo.consecutivo1,
                        consecutivo2: datosArchivo.consecutivo2,
                        activo: true,
                        fechaCreacion: new Date(),
                        fechaSolicitud: new Date()
                    }, { transaction, returning: true });

                } catch (createError) {
                    await transaction.rollback();

                    if (createError.name === 'SequelizeUniqueConstraintError') {
                        autorizacion = await this.autorizacionModel.findOne({
                            where: {
                                municipioId: municipio.id,
                                modalidadId: modalidad.id,
                                tipoId: tipoAutorizacion.id,
                                consecutivo1: datosArchivo.consecutivo1,
                                consecutivo2: datosArchivo.consecutivo2
                            }
                        });
                        if (!autorizacion) throw createError;
                        return { autorizacion, municipio, modalidad, tipoAutorizacion };
                    }
                    throw createError;
                }
            }

            if (!transaction.finished) await transaction.commit();
            return { autorizacion, municipio, modalidad, tipoAutorizacion };

        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    generarNombreCarpeta(numeroAutorizacion, municipioNum, modalidadNum, consecutivo1, consecutivo2, tipoAbrev) {
        return [
            numeroAutorizacion,
            municipioNum.toString().padStart(2, '0'),
            modalidadNum.toString().padStart(2, '0'),
            consecutivo1.toString().padStart(4, '0'),
            consecutivo2.toString().padStart(4, '0'),
            tipoAbrev
        ].join('_');
    }

    async procesarArchivoMasivo(archivoData, autorizacionInfo, userId, opciones = {}) {
        const { useOcr = false } = opciones;
        const transaction = await this.documentoModel.sequelize.transaction();

        try {
            const { autorizacion, municipio, tipoAutorizacion } = autorizacionInfo;

            let bufferFinal = archivoData.buffer;
            let textoOCR = null;
            let estadoOCR = useOcr ? 'pendiente' : 'no_aplica';

            if (useOcr) {
                estadoOCR = 'procesando';

                const resultadoOCR = await OCRProcessorService.procesarPDFConOCR(
                    archivoData.buffer,
                    archivoData.nombre
                );

                if (resultadoOCR.success) {
                    bufferFinal = resultadoOCR.pdfBuffer;
                    textoOCR = resultadoOCR.text;
                    estadoOCR = 'completado';
                } else {
                    estadoOCR = 'fallido';
                    throw new Error(`Rechazado en validación de servidor Python: ${resultadoOCR.error || 'Falla OCR'}`);
                }
            }

            const documentoExistente = await this.documentoModel.findOne({
                where: { autorizacionId: autorizacion.id, version_actual: true },
                transaction
            });

            const estructura = this.construirEstructuraCarpetasNumericos({
                municipio: { id: municipio.num },
                tipoAutorizacion: { id: tipoAutorizacion.id, abreviatura: tipoAutorizacion.abreviatura },
                numero: autorizacion.numeroAutorizacion,
                consecutivo: autorizacion.consecutivo1,
                nombreCarpeta: autorizacion.nombreCarpeta
            });

            await this.crearEstructuraCarpetas(estructura.rutaCompleta);

            const version = documentoExistente ? documentoExistente.version + 1 : 1;
            const nombreArchivo = this.generarNombreArchivoMasivo(autorizacion, archivoData.nombre, version);
            const rutaArchivo = path.join(estructura.rutaCompleta, nombreArchivo);

            await fs.writeFile(rutaArchivo, bufferFinal);

            const checksumMd5 = crypto.createHash('md5').update(bufferFinal).digest('hex');
            const checksumSha256 = crypto.createHash('sha256').update(bufferFinal).digest('hex');

            if (documentoExistente) {
                await documentoExistente.update({ version_actual: false }, { transaction });
            }

            const nuevoDocumento = await this.documentoModel.create({
                autorizacionId: autorizacion.id,
                titulo: `Documento de autorización ${autorizacion.numeroAutorizacion}`,
                descripcion: `Documento cargado masivamente: ${archivoData.nombreOriginal || archivoData.nombre}`,
                version,
                version_actual: true,
                documentoPadreId: documentoExistente ? documentoExistente.id : null,
                estadoDigitalizacion: 'digitalizado',
                paginas: this.estimarPaginas(bufferFinal),
                creadoPor: userId
            }, { transaction });

            await this.archivoDigitalModel.create({
                documento_id: nuevoDocumento.id,
                nombre_archivo: nombreArchivo,
                ruta_almacenamiento: path.join(estructura.rutaRelativa, nombreArchivo),
                mime_type: 'application/pdf',
                tamano_bytes: bufferFinal.length,
                checksum_md5: checksumMd5,
                checksum_sha256: checksumSha256,
                estado_ocr: estadoOCR,
                texto_ocr: textoOCR,
                fecha_digitalizacion: new Date(),
                digitalizado_por: userId,
                version_archivo: version,
                total_paginas: this.estimarPaginas(bufferFinal)
            }, { transaction });

            await transaction.commit();

            return {
                autorizacionId: autorizacion.id,
                numeroAutorizacion: autorizacion.numeroAutorizacion,
                documentoId: nuevoDocumento.id,
                version,
                archivo: nombreArchivo,
                ocrAplicado: useOcr,
                estadoOCR,
                exito: true
            };

        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    }

    construirEstructuraCarpetasNumericos(autorizacion) {
        const municipioId = String(autorizacion.municipio.id).padStart(2, '0');
        const tipoAutorizacionId = String(autorizacion.tipoAutorizacion.id).padStart(2, '0');
        const carpetaAutorizacion = autorizacion.nombreCarpeta;

        const rutaRelativa = path.join(municipioId, tipoAutorizacionId, carpetaAutorizacion);
        const basePath = process.env.FILE_STORAGE_PATH || './storage';
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
        const nombreBase = autorizacion.nombreCarpeta;
        const timestamp = Date.now();
        return `${nombreBase}_v${version}_${timestamp}${extension}`;
    }

    estimarPaginas(buffer) {
        const texto = buffer.toString('latin1');
        const matches = texto.match(/\/Type\s*\/Page\b/g);
        return matches ? matches.length : 1;
    }

    async procesarCargaMasiva(archivos, userId, opciones = {}) {
        const { useOcr = false, loteSize = 5, loteId = null, origen = 'DIRECTO' } = opciones;

        try {
            const resultados = {
                total: archivos.length,
                exitosos: 0,
                fallidos: 0,
                conOCR: useOcr,
                detalles: []
            };

            if (useOcr) {
                // OCR sync (uno por uno)
                for (const archivo of archivos) {
                    try {
                        if (archivo.errorNomenclatura) {
                            throw new Error('El archivo no cumple con la nomenclatura obligatoria');
                        }

                        const datosArchivo = this.parsearNombreArchivo(archivo.nombre);
                        const autorizacionInfo = await this.buscarOCrearAutorizacion(datosArchivo, userId);

                        const resultado = await this.procesarArchivoMasivo(
                            { ...archivo, nombreOriginal: datosArchivo.nombreOriginal },
                            autorizacionInfo,
                            userId,
                            { useOcr: true }
                        );

                        resultados.exitosos++;
                        resultados.detalles.push({ archivo: archivo.nombre, exito: true, ...resultado });

                    } catch (error) {
                        resultados.fallidos++;
                        resultados.detalles.push({ archivo: archivo.nombre, exito: false, error: error.message });
                    }
                }

                return resultados;
            }

            // Normal paralelo por lotes
            for (let i = 0; i < archivos.length; i += loteSize) {
                const lote = archivos.slice(i, i + loteSize);

                const promesas = lote.map(async (archivo) => {
                    let proceso = null;

                    try {
                        if (archivo.errorNomenclatura) {
                            throw new Error('El archivo no cumple con la nomenclatura obligatoria');
                        }

                        const datosArchivo = this.parsearNombreArchivo(archivo.nombre);
                        const autorizacionInfo = await this.buscarOCrearAutorizacion(datosArchivo, userId);

                        proceso = await this.ocrProcesoModel.create({
                            lote_id: loteId || `lote_sync_${Date.now()}_${userId}`,
                            archivo_id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            nombre_archivo: archivo.nombre,
                            autorizacion_id: autorizacionInfo.autorizacion.id,
                            user_id: userId,
                            estado: 'procesando',
                            tipo_proceso: 'NORMAL',
                            origen,
                            metadata: {
                                useOcr,
                                tamano: archivo.tamano
                            }
                        });

                        const resultado = await this.procesarArchivoMasivo(
                            { ...archivo, nombreOriginal: datosArchivo.nombreOriginal },
                            autorizacionInfo,
                            userId
                        );

                        await proceso.update({
                            estado: 'completado',
                            documento_id: resultado.documentoId,
                            fecha_procesado: new Date()
                        });

                        resultados.exitosos++;
                        resultados.detalles.push({ archivo: archivo.nombre, exito: true, ...resultado });

                    } catch (error) {
                        if (proceso) {
                            await proceso.update({ estado: 'fallado', error: error.message });
                        }
                        resultados.fallidos++;
                        resultados.detalles.push({ archivo: archivo.nombre, exito: false, error: error.message });
                    }
                });

                await Promise.all(promesas);
            }

            return resultados;

        } catch (error) {
            throw new Error(`Error en carga masiva: ${error.message}`);
        }
    }

    async procesarArchivosDirectos(archivos, userId, opciones = {}) {
        const archivosProcesados = archivos.map(archivo => ({
            nombre: archivo.originalname,
            buffer: archivo.buffer,
            tamano: archivo.size
        }));

        return await this.procesarCargaMasiva(archivosProcesados, userId, opciones);
    }

    /**
     * Iniciar procesamiento OCR asíncrono (ZIP/lote)
     */
    async iniciarProcesamientoOCRAsincrono(archivos, userId, loteId) {
        try {
            if (!archivos || archivos.length === 0) {
                throw new Error('No se encontraron archivos PDF para iniciar OCR');
            }

            const procesos = [];

            for (const archivo of archivos) {
                try {
                    if (archivo.errorNomenclatura) {
                        throw new Error('El archivo no cumple con la nomenclatura obligatoria');
                    }

                    const datosArchivo = this.parsearNombreArchivo(archivo.nombre);
                    const autorizacionInfo = await this.buscarOCrearAutorizacionRapido(datosArchivo, userId);

                    const proceso = await this.ocrProcesoModel.create({
                        lote_id: loteId,
                        archivo_id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        nombre_archivo: archivo.nombre,
                        autorizacion_id: autorizacionInfo.autorizacion.id,
                        user_id: userId,
                        estado: 'pendiente',
                        intentos: 0,
                        metadata: {
                            datosArchivo,
                            tamano: archivo.tamano,
                            rutaRelativa: archivo.rutaRelativa
                        }
                    });

                    procesos.push(proceso);

                    // Disparar async
                    this.enviarArchivoParaOCR(archivo, proceso, autorizacionInfo, userId)
                        .catch(err => console.error(`Error procesando ${archivo.nombre}:`, err));

                } catch (error) {
                    console.error(`Error procesando [${archivo.nombre}]:`, error.message);

                    if (error.message.includes('nomenclatura obligatoria')) {
                        console.warn(`[OMITIDO] Archivo inválido extraído del ZIP: ${archivo.nombre}`);
                    } else {
                        // Registrar fallo si tu tabla lo permite sin autorizacion_id
                        try {
                            await this.ocrProcesoModel.create({
                                lote_id: loteId,
                                archivo_id: `temp_${Date.now()}_err`,
                                nombre_archivo: archivo.nombre,
                                autorizacion_id: null,
                                user_id: userId,
                                estado: 'fallado',
                                error: error.message,
                                intentos: 1,
                                metadata: { error: true }
                            });
                        } catch (bdError) {
                            console.error('No se pudo registrar el fallo en BD:', bdError.message);
                        }
                    }
                }
            }

            return { loteId, total: archivos.length, procesos: procesos.length };

        } catch (error) {
            console.error('Error iniciando procesamiento asíncrono:', error);
            throw error;
        }
    }

    async buscarOCrearAutorizacionRapido(datosArchivo, userId) {
        try {
            const municipio = await this.municipioModel.findOne({
                where: { num: datosArchivo.municipioNum },
                attributes: ['id', 'num']
            });
            if (!municipio) throw new Error(`Municipio ${datosArchivo.municipioNum} no encontrado`);

            const modalidad = await this.modalidadModel.findOne({
                where: { num: datosArchivo.modalidadNum },
                attributes: ['id', 'num']
            });
            if (!modalidad) throw new Error(`Modalidad ${datosArchivo.modalidadNum} no encontrada`);

            const tipoAutorizacion = await this.tiposAutorizacionModel.findOne({
                where: { abreviatura: datosArchivo.tipoAbrev },
                attributes: ['id', 'abreviatura']
            });
            if (!tipoAutorizacion) throw new Error(`Tipo autorización ${datosArchivo.tipoAbrev} no encontrado`);

            let autorizacion = await this.autorizacionModel.findOne({
                where: {
                    municipioId: municipio.id,
                    modalidadId: modalidad.id,
                    tipoId: tipoAutorizacion.id,
                    consecutivo1: datosArchivo.consecutivo1,
                    consecutivo2: datosArchivo.consecutivo2
                },
                attributes: ['id', 'numeroAutorizacion', 'nombreCarpeta', 'consecutivo1', 'municipioId', 'tipoId']
            });

            if (!autorizacion) {
                try {
                    autorizacion = await this.autorizacionModel.create({
                        numeroAutorizacion: datosArchivo.numeroAutorizacion,
                        municipioId: municipio.id,
                        modalidadId: modalidad.id,
                        tipoId: tipoAutorizacion.id,
                        consecutivo1: datosArchivo.consecutivo1,
                        consecutivo2: datosArchivo.consecutivo2,
                        activo: true,
                        fechaCreacion: new Date(),
                        fechaSolicitud: new Date()
                    });
                } catch (createError) {
                    if (createError.name === 'SequelizeUniqueConstraintError') {
                        autorizacion = await this.autorizacionModel.findOne({
                            where: {
                                municipioId: municipio.id,
                                modalidadId: modalidad.id,
                                tipoId: tipoAutorizacion.id,
                                consecutivo1: datosArchivo.consecutivo1,
                                consecutivo2: datosArchivo.consecutivo2
                            },
                            attributes: ['id', 'numeroAutorizacion', 'nombreCarpeta', 'consecutivo1', 'municipioId', 'tipoId']
                        });
                        if (!autorizacion) throw createError;
                    } else {
                        throw createError;
                    }
                }
            }

            return { autorizacion, municipio, modalidad, tipoAutorizacion };
        } catch (error) {
            console.error("Error en buscarOCrearAutorizacionRapido:", error);
            throw error;
        }
    }

    /**
     * Enviar archivo a Python para OCR (asíncrono)
     * NO usa /list. Guarda pythonPdfId en metadata.
     */
    async enviarArchivoParaOCR(archivoData, proceso, autorizacionInfo, userId) {
        try {
            const intentosActuales = Number(proceso.intentos || 0) + 1;

            await proceso.update({
                estado: 'procesando',
                intentos: intentosActuales
            });

            const envio = await OCRProcessorService.enviarPDFParaOCR(
                archivoData.buffer,
                archivoData.nombre
            );

            if (!envio.success) {
                throw new Error(`Error enviando a Python: ${envio.error}`);
            }

            // Guardar pythonPdfId y taskId en metadata
            await proceso.update({
                metadata: {
                    ...(proceso.metadata || {}),
                    taskId: envio.taskId || "",
                    pythonPdfId: envio.pythonPdfId
                }
            });

            // Monitoreo (poll por upload-status/{pythonPdfId})
            this.monitorearProcesoOCR(proceso, autorizacionInfo, userId, archivoData)
                .catch(err => console.error('Error monitoreando OCR:', err));

            return { success: true, pythonPdfId: envio.pythonPdfId, taskId: envio.taskId };

        } catch (error) {
            // Reintentos controlados
            const maxIntentos = Number(proceso.max_intentos || proceso.maxIntentos || 3);
            const intentos = Number(proceso.intentos || 0);

            await proceso.update({
                estado: intentos >= maxIntentos ? 'fallado' : 'pendiente',
                error: error.message
            });

            throw error;
        }
    }

    /**
     * Monitorear proceso OCR
     * SIN /list: consulta /upload-status/{pythonPdfId}
     */
    async monitorearProcesoOCR(proceso, autorizacionInfo, userId, archivoData) {
        const maxIntentosPolling = 60; // 5 min (60 * 5s)
        let intentos = 0;

        const intervalo = setInterval(async () => {
            try {
                intentos++;

                const pythonPdfId = proceso.metadata?.pythonPdfId;
                if (!pythonPdfId) {
                    // Si por timing aún no se guardó, esperar
                    if (intentos >= maxIntentosPolling) {
                        clearInterval(intervalo);
                        await proceso.update({ estado: 'fallado', error: 'pythonPdfId no disponible para monitoreo' });
                    }
                    return;
                }

                const estado = await OCRProcessorService.verificarEstadoOCRUnico(pythonPdfId, 8000);

                if (estado.status === 'completed') {
                    clearInterval(intervalo);

                    await this.finalizarProcesoOCRExitoso(
                        proceso,
                        { success: true, status: 'completed', pythonPdfId },
                        autorizacionInfo,
                        userId,
                        archivoData
                    );

                    return;
                }

                if (estado.status === 'failed') {
                    clearInterval(intervalo);
                    await proceso.update({ estado: 'fallado', error: estado.error || 'OCR falló en Python' });
                    return;
                }

                // pending/processing: seguir esperando hasta timeout
                if (intentos >= maxIntentosPolling) {
                    clearInterval(intervalo);

                    const maxIntentos = Number(proceso.max_intentos || proceso.maxIntentos || 3);
                    const intentosEnvio = Number(proceso.intentos || 0);

                    await proceso.update({
                        estado: intentosEnvio >= maxIntentos ? 'fallado' : 'pendiente',
                        error: 'Timeout en procesamiento OCR'
                    });

                    // Reintentar envío si todavía puede
                    if (intentosEnvio < maxIntentos) {
                        setTimeout(() => {
                            this.enviarArchivoParaOCR(archivoData, proceso, autorizacionInfo, userId)
                                .catch(console.error);
                        }, 30000);
                    }
                }

            } catch (error) {
                console.error(`Error monitoreando ${proceso.nombre_archivo}:`, error);

                if (intentos >= maxIntentosPolling) {
                    clearInterval(intervalo);
                    await proceso.update({ estado: 'fallado', error: error.message });
                }
            }
        }, 5000);
    }

    /**
     * Finalizar proceso OCR exitoso
     * Descargas siguen igual (searchable-pdf y text)
     */
    async finalizarProcesoOCRExitoso(proceso, estado, autorizacionInfo, userId, archivoData) {
        try {
            const pythonPdfId = estado.pythonPdfId || proceso.metadata?.pythonPdfId;
            if (!pythonPdfId) throw new Error('pythonPdfId no disponible en el estado');

            // Descargar resultados ANTES de transacción
            const [pdfResult, textResult] = await Promise.all([
                OCRProcessorService.descargarPDFConOCR(pythonPdfId),
                OCRProcessorService.descargarTextoOCR(pythonPdfId)
            ]);

            // Si no están listos (202/404), reprogramar verificación
            if (!pdfResult.success || !textResult.success) {
                const sc1 = pdfResult.statusCode;
                const sc2 = textResult.statusCode;

                if (sc1 === 202 || sc2 === 202 || sc1 === 404 || sc2 === 404) {
                    this.reprogramarVerificacion(proceso, autorizacionInfo, userId, archivoData);
                    return { success: false, retry: true };
                }

                throw new Error(`Error descargando resultados: ${pdfResult.error || textResult.error}`);
            }

            // Si text viene como objeto pending (por tu backend)
            if (textResult?.text && typeof textResult.text === 'object' && textResult.text.status === 'pending') {
                this.reprogramarVerificacion(proceso, autorizacionInfo, userId, archivoData);
                return { success: false, retry: true };
            }

            const transaction = await this.documentoModel.sequelize.transaction();

            try {
                const documentoExistente = await this.documentoModel.findOne({
                    where: { autorizacionId: autorizacionInfo.autorizacion.id, version_actual: true },
                    transaction
                });

                const estructura = this.construirEstructuraCarpetasNumericos({
                    municipio: { id: autorizacionInfo.municipio.num },
                    tipoAutorizacion: { id: autorizacionInfo.tipoAutorizacion.id, abreviatura: autorizacionInfo.tipoAutorizacion.abreviatura },
                    numero: autorizacionInfo.autorizacion.numeroAutorizacion,
                    consecutivo: autorizacionInfo.autorizacion.consecutivo1,
                    nombreCarpeta: autorizacionInfo.autorizacion.nombreCarpeta
                });

                await this.crearEstructuraCarpetas(estructura.rutaCompleta);

                const version = documentoExistente ? documentoExistente.version + 1 : 1;
                const nombreArchivo = this.generarNombreArchivoMasivo(
                    autorizacionInfo.autorizacion,
                    archivoData.nombre,
                    version
                );

                const rutaArchivo = path.join(estructura.rutaCompleta, nombreArchivo);
                await fs.writeFile(rutaArchivo, pdfResult.pdfBuffer);

                const checksumMd5 = crypto.createHash('md5').update(pdfResult.pdfBuffer).digest('hex');
                const checksumSha256 = crypto.createHash('sha256').update(pdfResult.pdfBuffer).digest('hex');

                if (documentoExistente) {
                    await documentoExistente.update({ version_actual: false }, { transaction });
                }

                const nuevoDocumento = await this.documentoModel.create({
                    autorizacionId: autorizacionInfo.autorizacion.id,
                    titulo: `Documento con OCR ${autorizacionInfo.autorizacion.numeroAutorizacion}`,
                    descripcion: `Documento procesado con OCR: ${archivoData.nombre}`,
                    version,
                    version_actual: true,
                    documentoPadreId: documentoExistente ? documentoExistente.id : null,
                    estadoDigitalizacion: 'digitalizado',
                    paginas: this.estimarPaginas(pdfResult.pdfBuffer),
                    creadoPor: userId
                }, { transaction });

                await this.archivoDigitalModel.create({
                    documento_id: nuevoDocumento.id,
                    nombre_archivo: nombreArchivo,
                    ruta_almacenamiento: path.join(estructura.rutaRelativa, nombreArchivo),
                    mime_type: 'application/pdf',
                    tamano_bytes: pdfResult.pdfBuffer.length,
                    checksum_md5: checksumMd5,
                    checksum_sha256: checksumSha256,
                    estado_ocr: 'completado',
                    texto_ocr: textResult.text,
                    fecha_digitalizacion: new Date(),
                    digitalizado_por: userId,
                    version_archivo: version,
                    total_paginas: this.estimarPaginas(pdfResult.pdfBuffer)
                }, { transaction });

                // Actualizar proceso
                await proceso.update({
                    estado: 'completado',
                    documento_id: nuevoDocumento.id,
                    fecha_procesado: new Date(),
                    metadata: {
                        ...(proceso.metadata || {}),
                        documentoId: nuevoDocumento.id,
                        rutaArchivo,
                        pythonPdfId
                    }
                }, { transaction });

                await transaction.commit();
                return { success: true, documentoId: nuevoDocumento.id };

            } catch (error) {
                await transaction.rollback();
                throw error;
            }

        } catch (error) {
            await proceso.update({
                estado: 'fallado',
                error: error.message,
                intentos: Number(proceso.intentos || 0) + 1
            });
            throw error;
        }
    }

    /**
     * Reprogramar verificación (para cuando PDF/text aún no estén listos)
     * SIN /list.
     */
    reprogramarVerificacion(proceso, autorizacionInfo, userId, archivoData) {
        setTimeout(async () => {
            try {
                const pythonPdfId = proceso.metadata?.pythonPdfId;
                if (!pythonPdfId) return;

                const estado = await OCRProcessorService.verificarEstadoOCRUnico(pythonPdfId, 8000);

                if (estado.status === 'completed') {
                    await this.finalizarProcesoOCRExitoso(
                        proceso,
                        { success: true, status: 'completed', pythonPdfId },
                        autorizacionInfo,
                        userId,
                        archivoData
                    );
                }
            } catch (error) {
                console.error(`Error en verificación reprogramada: ${error.message}`);
            }
        }, 10000);
    }

    /**
     * Reconciliar procesos pendientes/procesando al listar (por si el worker se cayó)
     * SIN /list: verifica cada proceso con /upload-status/{pythonPdfId}
     */
    async reconciliarProcesosOCRPendientes(userId) {
        const pendientes = await this.ocrProcesoModel.findAll({
            where: {
                user_id: userId,
                estado: { [Op.in]: ['pendiente', 'procesando'] }
            }
        });

        if (!pendientes.length) return;

        for (const proceso of pendientes) {
            const pythonPdfId = proceso.metadata?.pythonPdfId;
            if (!pythonPdfId) continue;

            const estado = await OCRProcessorService.verificarEstadoOCRUnico(pythonPdfId, 8000);
            if (estado.status !== 'completed') continue;

            await this.finalizarProcesoOCRExitoso(
                proceso,
                { success: true, status: 'completed', pythonPdfId },
                await this.obtenerAutorizacionInfoDesdeProceso(proceso),
                proceso.user_id,
                { nombre: proceso.nombre_archivo }
            );
        }
    }

    async obtenerAutorizacionInfoDesdeProceso(proceso) {
        if (!proceso.autorizacion_id) {
            throw new Error('El proceso OCR no tiene autorizacion_id');
        }

        const autorizacion = await this.autorizacionModel.findByPk(proceso.autorizacion_id, {
            attributes: ['id', 'numeroAutorizacion', 'nombreCarpeta', 'consecutivo1', 'municipioId', 'tipoId']
        });
        if (!autorizacion) throw new Error(`Autorización ${proceso.autorizacion_id} no encontrada`);

        const municipio = await this.municipioModel.findByPk(autorizacion.municipioId, {
            attributes: ['id', 'num']
        });
        if (!municipio) throw new Error('Municipio no encontrado para la autorización');

        const tipoAutorizacion = await this.tiposAutorizacionModel.findByPk(autorizacion.tipoId, {
            attributes: ['id', 'abreviatura']
        });
        if (!tipoAutorizacion) throw new Error('Tipo de autorización no encontrado');

        return { autorizacion, municipio, tipoAutorizacion };
    }

    /**
     * Estado de lote OCR
     */
    async obtenerEstadoLoteOCR(loteId, userId) {
        const procesos = await this.ocrProcesoModel.findAll({
            where: { lote_id: loteId, user_id: userId },
            attributes: ['estado', 'created_at']
        });

        const conteo = procesos.reduce((acc, p) => {
            acc[p.estado] = (acc[p.estado] || 0) + 1;
            return acc;
        }, {});

        return {
            total: procesos.length,
            conteo,
            completado: conteo.completado || 0,
            pendiente: conteo.pendiente || 0,
            procesando: conteo.procesando || 0,
            fallado: conteo.fallado || 0,
            porcentaje: procesos.length > 0
                ? Math.round(((conteo.completado || 0) / procesos.length) * 100)
                : 0
        };
    }

    /**
     * Resultados lote OCR
     */
    async obtenerResultadosLoteOCR(loteId, userId) {
        const procesos = await this.ocrProcesoModel.findAll({
            where: { lote_id: loteId, user_id: userId },
            include: [
                { model: this.documentoModel, as: 'documento', attributes: ['id', 'version', 'titulo'] },
                { model: this.autorizacionModel, as: 'autorizacion', attributes: ['id', 'numeroAutorizacion'] }
            ],
            order: [['created_at', 'DESC']]
        });

        const resultados = procesos.map(p => ({
            nombreArchivo: p.nombre_archivo,
            estado: p.estado,
            error: p.error,
            documentoId: p.documento_id,
            autorizacionId: p.autorizacion_id,
            numeroAutorizacion: p.autorizacion ? p.autorizacion.numeroAutorizacion : null,
            intentos: p.intentos,
            fechaCreacion: p.created_at,
            fechaProcesado: p.fecha_procesado
        }));

        const conteo = procesos.reduce((acc, p) => {
            acc[p.estado] = (acc[p.estado] || 0) + 1;
            return acc;
        }, {});

        return {
            total: procesos.length,
            conteo,
            resultados,
            todosCompletados: (conteo.completado || 0) === procesos.length,
            tieneErrores: (conteo.fallado || 0) > 0
        };
    }

    /**
     * Listar lotes por usuario
     * SIN /list: el porcentaje se calcula con BD
     */
    async listarLotesPorUsuario(userId, limit = 20, offset = 0) {
        const { fn, col, literal } = this.ocrProcesoModel.sequelize;

        // intenta completar procesos colgados antes de listar
        await this.reconciliarProcesosOCRPendientes(userId);

        const lotes = await this.ocrProcesoModel.findAll({
            where: { user_id: userId },
            attributes: [
                ['lote_id', 'loteId'],
                ['tipo_proceso', 'tipoProceso'],
                ['origen', 'origen'],

                [fn('COUNT', col('id')), 'totalArchivos'],
                [fn('SUM', literal(`CASE WHEN estado = 'completado' THEN 1 ELSE 0 END`)), 'completados'],
                [fn('SUM', literal(`CASE WHEN estado = 'fallado' THEN 1 ELSE 0 END`)), 'fallados'],

                [
                    fn('ARRAY_AGG', literal(`CASE WHEN estado = 'fallado' THEN error ELSE NULL END`)),
                    'errores'
                ],

                [
                    fn(
                        'JSON_AGG',
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
            `)
                    ),
                    'archivosProcesados'
                ],

                [fn('MAX', col('created_at')), 'ultimoProceso']
            ],
            group: ['lote_id', 'tipo_proceso', 'origen'],
            order: [[literal('"ultimoProceso"'), 'DESC']],
            limit,
            offset,
            raw: true
        });

        return lotes.map(lote => {
            const total = Number(lote.totalArchivos || 0);
            const completados = Number(lote.completados || 0);
            const fallados = Number(lote.fallados || 0);

            const porcentaje = total > 0 ? Math.round((completados / total) * 100) : 0;

            return {
                loteId: lote.loteId,
                tipoProceso: lote.tipoProceso,
                origen: lote.origen,

                totalArchivos: total,
                completados,
                fallados,

                porcentaje,

                errores: (lote.errores || []).filter(Boolean),
                archivosProcesados: (lote.archivosProcesados || []).filter(Boolean),
                ultimoProceso: lote.ultimoProceso
            };
        });
    }

    /**
     * Procesamiento directo OCR asíncrono
     */
    async iniciarProcesamientoDirectoOCRAsincrono(archivos, userId, loteId) {
        try {
            const procesos = [];

            for (const archivo of archivos) {
                let autorizacionInfo = null;

                try {
                    const datosArchivo = this.parsearNombreArchivo(archivo.originalname);
                    autorizacionInfo = await this.buscarOCrearAutorizacionRapido(datosArchivo, userId);

                    const proceso = await this.ocrProcesoModel.create({
                        lote_id: loteId,
                        archivo_id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        nombre_archivo: archivo.originalname,
                        autorizacion_id: autorizacionInfo.autorizacion.id,
                        user_id: userId,
                        estado: 'pendiente',
                        intentos: 0,
                        metadata: {
                            datosArchivo,
                            tamano: archivo.size
                        }
                    });

                    procesos.push(proceso);

                    this.enviarArchivoParaOCR(
                        { buffer: archivo.buffer, nombre: archivo.originalname, tamano: archivo.size },
                        proceso,
                        autorizacionInfo,
                        userId
                    ).catch(err => console.error(`Error procesando ${archivo.originalname}:`, err));

                } catch (error) {
                    console.error(`Error preparando ${archivo.originalname}:`, error);

                    await this.ocrProcesoModel.create({
                        lote_id: loteId,
                        archivo_id: `error_${Date.now()}`,
                        nombre_archivo: archivo.originalname,
                        autorizacion_id: autorizacionInfo?.autorizacion?.id ?? null,
                        user_id: userId,
                        estado: 'fallado',
                        error: error.message,
                        intentos: 1,
                        metadata: { error: true }
                    });
                }
            }

            return { loteId, total: archivos.length, procesos: procesos.length };

        } catch (error) {
            console.error('Error iniciando procesamiento directo asíncrono:', error);
            throw error;
        }
    }
}

module.exports = new CargaMasivaService();