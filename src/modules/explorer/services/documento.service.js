const User = require("../../users/models/user.model");
const Documento = require("../models/documento.model");
const ArchivoDigital = require("../models/archivo-digital.model");
const Autorizacion = require("../models/autorizacion.model");
const Modalidad = require("../models/Modalidad.model");
const TiposAutorizacion = require("../models/TiposAutorizacion.model");
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
const Municipio = require("../../municipios/models/municipio.model");
const ArchivoVisita = require("../models/archivo-visita.model");
const { Op } = require("sequelize");

class DocumentoService {
  // Crear un nuevo documento
  async crearDocumento(data, archivo, userId) {
    const transaction = await Documento.sequelize.transaction();

    try {
      // Verificar que la autorización existe antes de crear el documento
      if (data.autorizacionId) {
        const autorizacionExistente = await Autorizacion.findByPk(
          data.autorizacionId,
        );
        if (!autorizacionExistente) {
          throw new Error(
            `La autorización con ID ${data.autorizacionId} no existe`,
          );
        }
      }

      // 1. Crear el documento
      const documento = await Documento.create(data, { transaction });
      if (archivo) {
        const archivoDigital = await this.procesarArchivo(
          documento,
          archivo,
          userId,
          transaction,
        );
        documento.dataValues.archivoDigital = archivoDigital;
      }

      await transaction.commit();

      // Obtener documento con relaciones
      const documentoCompleto = await Documento.findByPk(documento.id, {
        include: [
          {
            model: ArchivoDigital,
            as: "archivosDigitales",
            required: false,
            include: [
              {
                model: User,
                as: "digitalizadoPor",
                attributes: [
                  "id",
                  "first_name",
                  "last_name",
                  "second_last_name",
                  "email",
                ],
              },
            ],
          },
          {
            model: Autorizacion,
            as: "autorizacion",
            include: [
              { model: Municipio, as: "municipio" },
              { model: Modalidad, as: "modalidad" },
              { model: TiposAutorizacion, as: "tipoAutorizacion" },
            ],
          },
        ],
      });

      return documentoCompleto;
    } catch (error) {
      await transaction.rollback();
      throw new Error(`Error al crear documento: ${error.message}`);
    }
  }
  async procesarArchivo(documento, archivo, userId, transaction) {
    console.log("  digitalizado_por: userId,");
    console.log(userId);
    try {
      // Obtener autorización para construir la ruta
      const autorizacion = await Autorizacion.findByPk(
        documento.autorizacionId,
        {
          include: [
            { model: Municipio, as: "municipio" },
            { model: TiposAutorizacion, as: "tipoAutorizacion" },
          ],
        },
      );

      if (!autorizacion) {
        throw new Error("Autorización no encontrada");
      }

      // Construir estructura de carpetas
      // const estructura = this.construirEstructuraCarpetas(autorizacion);
      const estructura =
        this.construirEstructuraCarpetasNumericos(autorizacion);

      // Crear carpetas si no existen
      await this.crearEstructuraCarpetas(estructura.rutaCompleta);

      // Generar nombre de archivo
      const nombreArchivo = this.generarNombreArchivo(
        autorizacion,
        documento,
        archivo,
      );
      const rutaArchivo = path.join(estructura.rutaCompleta, nombreArchivo);

      // Guardar archivo físicamente
      await fs.writeFile(rutaArchivo, archivo.buffer);

      // Calcular checksums
      const checksumMd5 = this.calcularChecksumMd5(archivo.buffer);
      const checksumSha256 = this.calcularChecksumSha256(archivo.buffer);

      // Crear registro de archivo digital
      const archivoDigital = await ArchivoDigital.create(
        {
          documento_id: documento.id,
          nombre_archivo: archivo.originalname,
          ruta_almacenamiento: path.join(
            estructura.rutaRelativa,
            nombreArchivo,
          ),
          mime_type: archivo.mimetype,
          tamano_bytes: archivo.size,
          checksum_md5: checksumMd5,
          checksum_sha256: checksumSha256,
          estado_ocr: "pendiente",
          // fecha_digitalizacion: new Date(),
          digitalizado_por: userId,
          version_archivo: 1,
          total_paginas: 1,
        },
        { transaction },
      );
      console.log("archivoDigital");
      console.log(archivoDigital);
      // Actualizar estado del documento
      await documento.update(
        {
          estadoDigitalizacion: "digitalizado",
          paginas: 1,
        },
        { transaction },
      );

      return archivoDigital;
    } catch (error) {
      throw new Error(`Error al procesar archivo: ${error.message}`);
    }
  }

  // Calcular checksum MD5
  calcularChecksumMd5(buffer) {
    return crypto.createHash("md5").update(buffer).digest("hex");
  }

  // Calcular checksum SHA256
  calcularChecksumSha256(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  // Construir estructura de carpetas (NUMÉRICA)
  construirEstructuraCarpetasNumericos(autorizacion) {
    const municipioId = String(autorizacion.municipio.id).padStart(2, "0");
    const tipoAutorizacionId = String(
      autorizacion.tipoAutorizacion.id,
    ).padStart(2, "0");
    const numero = String(autorizacion.numero).padStart(4, "0");
    const consecutivo = String(autorizacion.consecutivo).padStart(4, "0");
    const abreviatura = autorizacion.tipoAutorizacion.abreviatura;

    const carpetaAutorizacion = autorizacion.nombreCarpeta;
    const rutaRelativa = path.join(
      municipioId,
      tipoAutorizacionId,
      carpetaAutorizacion,
    );

    const basePath = process.env.FILE_STORAGE_PATH || "./storage";
    const rutaCompleta = path.join(basePath, rutaRelativa);
    return {
      rutaRelativa,
      rutaCompleta,
      carpetaAutorizacion,
    };
  }

  // Construir estructura de carpetas
  construirEstructuraCarpetas(autorizacion) {
    const municipioNombre = autorizacion.municipio.nombre.replace(/\s+/g, "_");
    const tipoAbreviatura = autorizacion.tipoAutorizacion.abreviatura;
    const carpetaAutorizacion =
      autorizacion.nombreCarpeta || `${autorizacion.id}`;

    // Ejemplo: 01_Acatlan/Concesiones (C)/2456 01-10-0001-0001 C/
    const rutaRelativa = path.join(
      `${municipioNombre}`,
      `${autorizacion.tipoAutorizacion.nombre} (${tipoAbreviatura})`,
      `${carpetaAutorizacion}`,
    );

    // Ruta base - configurable
    const basePath = process.env.FILE_STORAGE_PATH || "./storage";
    const rutaCompleta = path.join(basePath, rutaRelativa);

    return {
      rutaRelativa,
      rutaCompleta,
      carpetaAutorizacion,
    };
  }

  // Crear estructura de carpetas
  async crearEstructuraCarpetas(ruta) {
    try {
      await fs.mkdir(ruta, { recursive: true });
    } catch (error) {
      throw new Error(`Error al crear carpetas: ${error.message}`);
    }
  }
  generarNombreArchivo(autorizacion, documento, archivo) {
    const extension = path.extname(archivo.originalname);
    const nombreBase = autorizacion.nombreCarpeta;
    const timestamp = Date.now();

    return `${nombreBase}_v${documento.version}_${timestamp}${extension}`;
  }

  calcularChecksum(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  // Obtener documento por ID
  async obtenerDocumentoPorId(id) {
    try {
      const documento = await Documento.findByPk(id, {
        include: [
          {
            model: ArchivoDigital,
            as: "archivosDigitales",
            required: false,
            paranoid: false, // Permitir obtener archivos borrados logicamente para ver por qué se eliminaron
            separate: true,
            include: [
              {
                model: User,
                as: "digitalizadoPor",
                required: false,
                paranoid: false,
                attributes: [
                  "id",
                  "first_name",
                  "last_name",
                  "second_last_name",
                  "email",
                ],
              },
            ],
            order: [["version_archivo", "DESC"]],
          },
          {
            model: Autorizacion,
            as: "autorizacion",
            include: [
              { model: Municipio, as: "municipio" },
              { model: Modalidad, as: "modalidad" },
              { model: TiposAutorizacion, as: "tipoAutorizacion" },
            ],
          },
          {
            model: Documento,
            as: "versiones",
            required: false,
            paranoid: false, // Necesario para que el Frontend vea las versiones marcadas como borradas
            include: [
              {
                model: ArchivoDigital,
                as: "archivosDigitales",
                required: false,
                paranoid: false, // Ver también el archivo original aunque esté borrado
                separate: true,
                include: [
                  {
                    model: User,
                    as: "digitalizadoPor",
                    required: false,
                    paranoid: false,
                    attributes: [
                      "id",
                      "first_name",
                      "last_name",
                      "second_last_name",
                      "email",
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      if (!documento) {
        throw new Error("Documento no encontrado");
      }

      return documento;
    } catch (error) {
      throw new Error(`Error al obtener documento: ${error.message}`);
    }
  }

  async obtenerDocumentosPorAutorizacion(autorizacionId, userId) {
    try {
      const documentosModels = await Documento.findAll({
        where: {
          autorizacionId,
          documento_padre_id: null, // Solo traer documentos raíz
        },
        paranoid: false,
        include: [
          {
            model: ArchivoDigital,
            as: "archivosDigitales",
            required: false,
            paranoid: false,
            separate: true,
            include: [
              {
                model: User,
                as: "digitalizadoPor",
                required: false,
                paranoid: false,
                attributes: [
                  "id",
                  "first_name",
                  "last_name",
                  "second_last_name",
                  "email",
                ],
              },
            ],
            order: [["version_archivo", "DESC"]],
            limit: 1,
          },
          {
            model: Documento,
            as: "versiones",
            required: false,
            paranoid: false,
            include: [
              {
                model: ArchivoDigital,
                as: "archivosDigitales",
                required: false,
                paranoid: false,
                separate: true,
                include: [
                  {
                    model: User,
                    as: "digitalizadoPor",
                    required: false,
                    paranoid: false,
                    attributes: [
                      "id",
                      "first_name",
                      "last_name",
                      "second_last_name",
                      "email",
                    ],
                  },
                ],
              },
            ],
            order: [["version", "DESC"]],
          },
        ],
        order: [["created_at", "DESC"]],
      });

      const documentos = documentosModels.map((d) => d.toJSON());

      if (documentos.length > 0) {
        // --- INICIO WORKAROUND SEQUELIZE V6 ---
        // Cargar manualmente los archivos de versiones de cualquier documento borrado logicamente
        const idsRevision = [];
        documentos.forEach((doc) => {
          if (
            doc.deleted_at &&
            (!doc.archivosDigitales || doc.archivosDigitales.length === 0)
          ) {
            idsRevision.push(doc.id);
          }
          if (doc.versiones && doc.versiones.length > 0) {
            doc.versiones.forEach((v) => {
              if (
                v.deleted_at &&
                (!v.archivosDigitales || v.archivosDigitales.length === 0)
              ) {
                idsRevision.push(v.id);
              }
            });
          }
        });

        // INYECCION DEBUG
        const debugWorkaround = {
          idsDetectadosEnCiclo: idsRevision,
          archivosRecuperadosBdCifra: 0,
          idsExtraidosDesdeTabla: [],
        };
        if (documentos.length > 0) {
          documentos[0]._debugWorkaround = debugWorkaround;
        }
        // FIN DEBUG

        if (idsRevision.length > 0) {
          const recuperadosModels = await ArchivoDigital.findAll({
            where: { documento_id: idsRevision },
            paranoid: false,
            include: [
              {
                model: User,
                as: "digitalizadoPor",
                required: false,
                paranoid: false,
                attributes: [
                  "id",
                  "first_name",
                  "last_name",
                  "second_last_name",
                  "email",
                ],
              },
            ],
          });
          const recuperados = recuperadosModels.map((m) => m.toJSON());

          // INYECCION DEBUG RELLENO
          debugWorkaround.archivosRecuperadosBdCifra = recuperados.length;
          debugWorkaround.idsExtraidosDesdeTabla = recuperados.map((r) => r.id);
          if (documentos.length > 0) {
            documentos[0]._debugWorkaround = debugWorkaround;
          }
          // FIN

          documentos.forEach((doc) => {
            if (idsRevision.includes(doc.id)) {
              doc.archivosDigitales = recuperados.filter(
                (a) => a.documento_id === doc.id,
              );
            }
            if (doc.versiones) {
              doc.versiones.forEach((v) => {
                if (idsRevision.includes(v.id)) {
                  v.archivosDigitales = recuperados.filter(
                    (a) => a.documento_id === v.id,
                  );
                }
              });
            }
          });
        }
        // --- FIN WORKAROUND ---
      }

      if (userId && documentos.length > 0) {
        let archivoRegistrado = false;

        for (const documento of documentos) {
          if (
            !archivoRegistrado &&
            documento.archivosDigitales &&
            documento.archivosDigitales.length > 0
          ) {
            const ultimaVersionArchivo = documento.archivosDigitales[0];

            const dosSegundosAtras = new Date(Date.now() - 3000);
            const visitaReciente = await ArchivoVisita.findOne({
              where: {
                archivo_id: ultimaVersionArchivo.id,
                usuario_id: userId,
                created_at: {
                  [Op.gte]: dosSegundosAtras,
                },
              },
            });

            if (!visitaReciente) {
              await ArchivoVisita.create({
                archivo_id: ultimaVersionArchivo.id,
                usuario_id: userId,
                fecha_apertura: new Date(),
              });
            }

            archivoRegistrado = true;
            break;
          }
        }
      }

      return documentos;
    } catch (error) {
      throw new Error(`Error al obtener documentos: ${error.message}`);
    }
  }

  _ultimoRegistro = {};

  async _registrarVisitaConDebounce(archivoId, userId) {
    const ahora = Date.now();
    const clave = `${userId}_${archivoId}`;

    if (
      this._ultimoRegistro[clave] &&
      ahora - this._ultimoRegistro[clave] < 3000
    ) {
      return;
    }

    this._ultimoRegistro[clave] = ahora;

    setTimeout(() => {
      delete this._ultimoRegistro[clave];
    }, 5000);

    return await this.registrarVisitaArchivo(archivoId, userId);
  }

  async registrarVisitaArchivo(archivoId, userId) {
    try {
      const visita = await ArchivoVisita.create({
        archivo_id: archivoId,
        usuario_id: userId,
        fecha_apertura: new Date(),
      });

      return visita;
    } catch (error) {
      throw new Error(`Error al registrar visita: ${error.message}`);
    }
  }

  async crearNuevaVersion(documentoId, data, archivo, userId) {
    const transaction = await Documento.sequelize.transaction();

    try {
      // 1. Obtener documento original
      const documentoOriginal = await Documento.findByPk(documentoId);
      if (!documentoOriginal) {
        throw new Error("Documento original no encontrado");
      }

      // 2. Desactivar versión actual del documento original
      await documentoOriginal.update(
        { version_actual: false },
        { transaction },
      );

      // 2.5 Obtener la versión máxima generada para este historial de documento
      const documentoPadreId =
        documentoOriginal.documento_padre_id || documentoOriginal.id;
      const maximaVersionItem = await Documento.findOne({
        where: {
          [Op.or]: [
            { id: documentoPadreId },
            { documento_padre_id: documentoPadreId },
          ],
        },
        attributes: [
          [
            Documento.sequelize.fn("MAX", Documento.sequelize.col("version")),
            "max_version",
          ],
        ],
        paranoid: false, // Buscar incluso en las versiones eliminadas lógicamente
        transaction,
      });

      // Si por alguna razón falla el MAX, cae de vuelta en la versión del documento modificado + 1
      const maxVersionHistorial = maximaVersionItem
        ? maximaVersionItem.get("max_version")
        : documentoOriginal.version;
      const nuevaVersionNumero =
        (maxVersionHistorial
          ? parseInt(maxVersionHistorial)
          : documentoOriginal.version) + 1;

      // 3. Crear nueva versión
      const nuevaVersionData = {
        ...documentoOriginal.toJSON(),
        id: undefined, // Para que cree nuevo registro
        version: nuevaVersionNumero,
        version_actual: true,
        documento_padre_id: documentoPadreId,
        titulo: data.titulo || documentoOriginal.titulo,
        descripcion: data.descripcion || documentoOriginal.descripcion,
        fechaDocumento: data.fechaDocumento || documentoOriginal.fechaDocumento,
        metadata: data.metadata || documentoOriginal.metadata,
      };
      console.log("nuevaVersionData");
      console.log(nuevaVersionData);
      const nuevaVersion = await Documento.create(nuevaVersionData, {
        transaction,
      });

      // 4. Si hay archivo, procesarlo
      if (archivo) {
        await this.procesarArchivo(nuevaVersion, archivo, userId, transaction);
      }

      await transaction.commit();

      return this.obtenerDocumentoPorId(nuevaVersion.id);
    } catch (error) {
      await transaction.rollback();
      throw new Error(`Error al crear nueva versión: ${error.message}`);
    }
  }

  async actualizarDocumento(id, data) {
    try {
      const documento = await Documento.findByPk(id);
      if (!documento) {
        throw new Error("Documento no encontrado");
      }

      await documento.update(data);
      return documento;
    } catch (error) {
      throw new Error(`Error al actualizar documento: ${error.message}`);
    }
  }

  async eliminarDocumento(id) {
    try {
      const documento = await Documento.findByPk(id);
      if (!documento) {
        throw new Error("Documento no encontrado");
      }

      await documento.destroy();
      return true;
    } catch (error) {
      throw new Error(`Error al eliminar documento: ${error.message}`);
    }
  }

  async eliminarVersionDocumento(documentoId, versionId) {
    const transaction = await Documento.sequelize.transaction();
    try {
      // 1. Obtener la version
      const versionEliminar = await Documento.findByPk(versionId, {
        include: [
          {
            model: ArchivoDigital,
            as: "archivosDigitales",
          },
        ],
      });
      if (!versionEliminar) {
        throw new Error("La versión especificada no existe");
      }

      // 2. Verificar cuántas versiones quedan en el historial de ESTE documento
      const documentoPadreId =
        versionEliminar.documento_padre_id || versionEliminar.id;

      const versionesRestantes = await Documento.count({
        where: {
          [Op.or]: [
            { id: documentoPadreId },
            { documento_padre_id: documentoPadreId },
          ],
        },
        paranoid: true, // Aseguramos que solo cuente las NO eliminadas
        transaction,
      });

      console.log(
        `Eliminando versión (ID: ${versionId}) del documento base ${documentoPadreId}. Quedan activas en este historial: ${versionesRestantes}`,
      );

      if (versionesRestantes <= 1) {
        throw new Error(
          "No puedes eliminar la última versión existente de este documento (quedan activas: " +
            versionesRestantes +
            ")",
        );
      }

      // 3. Si era la actual, transferir el poder a la versión anterior viva del MISMO documento
      if (versionEliminar.version_actual) {
        const versionAnterior = await Documento.findOne({
          where: {
            [Op.or]: [
              { id: documentoPadreId },
              { documento_padre_id: documentoPadreId },
            ],
            id: { [Op.ne]: versionEliminar.id },
          },
          order: [
            ["version", "DESC"],
            ["created_at", "DESC"],
          ],
          transaction,
        });

        if (versionAnterior) {
          await versionAnterior.update(
            { version_actual: true },
            { transaction },
          );
        }
      }

      // 4. Eliminar logicamente los archivos (bypass a paranoid)
      if (
        versionEliminar.archivosDigitales &&
        versionEliminar.archivosDigitales.length > 0
      ) {
        for (let arc of versionEliminar.archivosDigitales) {
          // Si ejecutamos destroy() hará Hard Delete porque no tiene timestamps: true
          // Se inyecta la fecha directamente para simular el Soft Delete
          await arc.update({ deleted_at: new Date() }, { transaction });
        }
      }

      // 5. Borrar la version lógica y marcarla como inactiva explícitamente
      await versionEliminar.update({ version_actual: false }, { transaction });
      await versionEliminar.destroy({ transaction });

      await transaction.commit();
      return versionEliminar;
    } catch (error) {
      await transaction.rollback();
      throw new Error(
        `Error al eliminar versión de documento: ${error.message}`,
      );
    }
  }

  // Buscar documentos
  async buscarDocumentos(criterios) {
    try {
      const where = {};

      if (criterios.titulo) {
        where.titulo = { [Op.iLike]: `%${criterios.titulo}%` };
      }

      if (criterios.autorizacionId) {
        where.autorizacionId = criterios.autorizacionId;
      }

      if (criterios.tipoDocumento) {
        where.tipoDocumento = criterios.tipoDocumento;
      }

      const documentos = await Documento.findAll({
        where,
        include: [
          {
            model: ArchivoDigital,
            as: "archivosDigitales",
            required: false,
            include: [
              {
                model: User,
                as: "digitalizadoPor",
                attributes: [
                  "id",
                  "first_name",
                  "last_name",
                  "second_last_name",
                  "email",
                ],
              },
            ],
          },
          {
            model: Autorizacion,
            as: "autorizacion",
            include: [
              { model: Municipio, as: "municipio" },
              { model: Modalidad, as: "modalidad" },
            ],
          },
        ],
        order: [["created_at", "DESC"]],
        limit: criterios.limit || 50,
        offset: criterios.offset || 0,
      });

      return documentos;
    } catch (error) {
      throw new Error(`Error al buscar documentos: ${error.message}`);
    }
  }

  // Obtener archivo digital
  async obtenerArchivoDigital(archivoId) {
    const archivo = await ArchivoDigital.findByPk(archivoId, {
      include: [
        {
          model: Documento,
          as: "documento",
          include: [
            {
              model: Autorizacion,
              as: "autorizacion",
            },
          ],
        },
      ],
    });

    if (!archivo) {
      throw new Error("Archivo digital no encontrado");
    }

    return archivo;
  }

  // async obtenerArchivoDigital(archivoId) {
  //     try {
  //         const archivo = await ArchivoDigital.findByPk(archivoId, {
  //             include: [{
  //                 model: Documento,
  //                 as: 'documento',
  //                 include: [{
  //                     model: Autorizacion,
  //                     as: 'autorizacion'
  //                 }]
  //             }]
  //         });

  //         if (!archivo) {
  //             throw new Error('Archivo digital no encontrado');
  //         }

  //         return archivo;
  //     } catch (error) {
  //         throw new Error(`Error al obtener archivo digital: ${error.message}`);
  //     }
  // }
}

module.exports = new DocumentoService();
