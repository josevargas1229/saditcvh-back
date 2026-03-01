const sequelize = require("../../../config/db");
const { QueryTypes } = require("sequelize");

class AnotacionService {
    /**
     * Crea una nueva anotación por nombre de archivo
     * - Tu tabla NO tiene: es_principal, version, eliminada, fecha_eliminacion, eliminada_por, updated_at
     * - Tu tabla SÍ tiene: archivo_nombre, documento_url, usuario_id, comentarios, metadata, created_at
     */
    async crearAnotacionPorArchivo(archivoNombre, documentoUrl, usuarioId, datos) {
        try {
            console.log('📝 Creando anotación por archivo:', archivoNombre, 'usuario:', usuarioId);
            console.log('📄 URL del documento recibida:', documentoUrl);

            // Verificar que tenemos la URL del documento
            if (!documentoUrl) {
                console.error('❌ Error: documentoUrl es undefined');
                throw new Error('Se requiere la URL del documento');
            }

            // Verificar si ya existe una anotación para este archivo y usuario
            const existeQuery = `
                SELECT id FROM anotaciones 
                WHERE archivo_nombre = :archivoNombre 
                AND usuario_id = :usuarioId
                LIMIT 1
            `;

            const existe = await sequelize.query(existeQuery, {
                replacements: { archivoNombre, usuarioId },
                type: QueryTypes.SELECT
            });

            console.log('🔍 Existe anotación previa?', existe.length > 0);

            // Preparar los datos para insertar/actualizar
            // Tu tabla tiene campos separados: comentarios y metadata
            const comentarios = datos.comentarios || [];
            const metadata = {
                ...(datos.metadata || {}),
                documento_url: documentoUrl,
                archivo_nombre: archivoNombre,
                fecha_guardado: new Date().toISOString(),
                total_comentarios: comentarios.length,
                origen: 'guardarPorArchivo',
                es_actualizacion: existe.length > 0,
                fecha_actualizacion: new Date().toISOString()
            };

            if (existe.length > 0) {
                console.log('🔄 Actualizando anotación existente, ID:', existe[0].id);

                // Actualizar la anotación existente
                const updateQuery = `
                    UPDATE anotaciones 
                    SET comentarios = :comentarios::jsonb, 
                        metadata = :metadata::jsonb,
                        documento_url = :documentoUrl
                    WHERE id = :id
                    RETURNING *
                `;

                const result = await sequelize.query(updateQuery, {
                    replacements: {
                        id: existe[0].id,
                        comentarios: JSON.stringify(comentarios),
                        metadata: JSON.stringify(metadata),
                        documentoUrl
                    },
                    type: QueryTypes.UPDATE
                });

                const anotacionActualizada = result[0][0];
                console.log('✅ Anotación actualizada:', anotacionActualizada.id);

                return anotacionActualizada;
            } else {
                console.log('🆕 Creando nueva anotación');

                // Insertar nueva anotación
                const insertQuery = `
                    INSERT INTO anotaciones (
                        archivo_nombre, documento_url, usuario_id, 
                        comentarios, metadata, created_at
                    ) VALUES (
                        :archivoNombre, :documentoUrl, :usuarioId, 
                        :comentarios::jsonb, :metadata::jsonb, NOW()
                    ) RETURNING *
                `;

                const result = await sequelize.query(insertQuery, {
                    replacements: {
                        archivoNombre,
                        documentoUrl,
                        usuarioId,
                        comentarios: JSON.stringify(comentarios),
                        metadata: JSON.stringify(metadata)
                    },
                    type: QueryTypes.INSERT
                });

                const nuevaAnotacion = result[0][0];
                console.log('✅ Nueva anotación creada:', nuevaAnotacion.id);

                return nuevaAnotacion;
            }
        } catch (error) {
            console.error('❌ Error detallado en crearAnotacionPorArchivo:', error);
            console.error('📌 Error stack:', error.stack);
            throw new Error(`Error al crear anotación por archivo: ${error.message}`);
        }
    }

    /**
     * Crea una nueva anotación por documento ID (opcional, para compatibilidad)
     */
    async crearAnotacion(documentoId, usuarioId, datos) {
        try {
            console.log('📝 Creando/Actualizando anotación para documento:', documentoId, 'usuario:', usuarioId);

            // Crear una clave única basada en documento_id y usuario_id
            const archivoNombre = `documento_${documentoId}_usuario_${usuarioId}`;
            const documentoUrl = `document://${documentoId}`;

            // Verificar si ya existe una anotación para este archivo y usuario
            const existeQuery = `
                SELECT id FROM anotaciones 
                WHERE archivo_nombre = :archivoNombre 
                AND usuario_id = :usuarioId
                LIMIT 1
            `;

            const existe = await sequelize.query(existeQuery, {
                replacements: { archivoNombre, usuarioId },
                type: QueryTypes.SELECT
            });

            // Usaremos metadata para almacenar el documento_id ya que tu tabla no tiene esa columna
            const metadata = {
                ...(datos.metadata || {}),
                documento_id: documentoId,
                fecha_guardado: new Date().toISOString(),
                total_comentarios: (datos.comentarios || []).length,
                es_actualizacion: existe.length > 0,
                fecha_actualizacion: existe.length > 0 ? new Date().toISOString() : undefined
            };

            if (existe.length > 0) {
                console.log('🔄 Actualizando anotación existente, ID:', existe[0].id);

                const updateQuery = `
                    UPDATE anotaciones 
                    SET comentarios = :comentarios::jsonb, 
                        metadata = :metadata::jsonb,
                        documento_url = :documentoUrl
                    WHERE id = :id
                    RETURNING *
                `;

                const result = await sequelize.query(updateQuery, {
                    replacements: {
                        id: existe[0].id,
                        comentarios: JSON.stringify(datos.comentarios || []),
                        metadata: JSON.stringify(metadata),
                        documentoUrl
                    },
                    type: QueryTypes.UPDATE
                });

                console.log('✅ Anotación actualizada:', result[0][0].id);
                return result[0][0];
            } else {
                console.log('🆕 Creando nueva anotación');

                const insertQuery = `
                    INSERT INTO anotaciones (
                        archivo_nombre, documento_url, usuario_id, 
                        comentarios, metadata, created_at
                    ) VALUES (
                        :archivoNombre, :documentoUrl, :usuarioId, 
                        :comentarios::jsonb, :metadata::jsonb, NOW()
                    ) RETURNING *
                `;

                const result = await sequelize.query(insertQuery, {
                    replacements: {
                        archivoNombre,
                        documentoUrl,
                        usuarioId,
                        comentarios: JSON.stringify(datos.comentarios || []),
                        metadata: JSON.stringify(metadata)
                    },
                    type: QueryTypes.INSERT
                });

                console.log('✅ Anotación creada:', result[0][0].id);
                return result[0][0];
            }
        } catch (error) {
            console.error('❌ Error en crearAnotacion:', error);
            throw new Error(`Error al crear/actualizar anotación: ${error.message}`);
        }
    }

    /**
     * Obtiene anotaciones por archivo
     */
    async obtenerAnotacionesPorArchivo(archivoNombre, usuarioId) {
        try {
            console.log('🔍 Obteniendo anotaciones por archivo:', archivoNombre, 'usuario:', usuarioId);

            const query = `
                SELECT * FROM anotaciones 
                WHERE archivo_nombre = :archivoNombre 
                AND usuario_id = :usuarioId
                ORDER BY created_at DESC
                LIMIT 1
            `;

            const result = await sequelize.query(query, {
                replacements: { archivoNombre, usuarioId },
                type: QueryTypes.SELECT
            });

            console.log('📊 Anotaciones encontradas:', result.length);
            return result;
        } catch (error) {
            console.error('❌ Error en obtenerAnotacionesPorArchivo:', error);
            throw new Error(`Error al obtener anotaciones por archivo: ${error.message}`);
        }
    }

    /**
     * Obtiene anotaciones por documento ID (desde metadata)
     */
    async obtenerAnotacionesPorDocumento(documentoId, usuarioId = null) {
        try {
            let whereConditions = ["metadata->>'documento_id' = :documentoId"];
            const params = { documentoId: documentoId.toString() };

            if (usuarioId) {
                whereConditions.push("usuario_id = :usuarioId");
                params.usuarioId = usuarioId;
            }

            const whereClause = whereConditions.join(" AND ");
            const query = `
                SELECT * FROM anotaciones 
                WHERE ${whereClause}
                ORDER BY created_at DESC
            `;

            const result = await sequelize.query(query, {
                replacements: params,
                type: QueryTypes.SELECT
            });

            return result;
        } catch (error) {
            console.error('❌ Error en obtenerAnotacionesPorDocumento:', error);
            throw new Error(`Error al obtener anotaciones: ${error.message}`);
        }
    }

    /**
     * Obtiene la última anotación de un documento para un usuario
     */
    async obtenerAnotacionPrincipal(documentoId, usuarioId) {
        try {
            const query = `
                SELECT * FROM anotaciones 
                WHERE metadata->>'documento_id' = :documentoId 
                AND usuario_id = :usuarioId
                ORDER BY created_at DESC
                LIMIT 1
            `;

            const result = await sequelize.query(query, {
                replacements: {
                    documentoId: documentoId.toString(),
                    usuarioId
                },
                type: QueryTypes.SELECT
            });

            return result.length > 0 ? result[0] : null;
        } catch (error) {
            console.error('❌ Error en obtenerAnotacionPrincipal:', error);
            throw new Error(`Error al obtener anotación principal: ${error.message}`);
        }
    }

    /**
     * Actualiza una anotación existente
     */
    async actualizarAnotacion(anotacionId, datos, usuarioId) {
        try {
            // Primero obtener la anotación actual
            const getQuery = `
                SELECT * FROM anotaciones WHERE id = :anotacionId
            `;

            const anotacionActual = await sequelize.query(getQuery, {
                replacements: { anotacionId },
                type: QueryTypes.SELECT
            });

            if (anotacionActual.length === 0) {
                throw new Error('Anotación no encontrada');
            }

            // Actualizar la anotación
            const updateQuery = `
                UPDATE anotaciones 
                SET comentarios = :comentarios::jsonb, 
                    metadata = :metadata::jsonb
                WHERE id = :anotacionId
                RETURNING *
            `;

            const result = await sequelize.query(updateQuery, {
                replacements: {
                    anotacionId,
                    comentarios: JSON.stringify(datos.comentarios || []),
                    metadata: JSON.stringify({
                        ...(anotacionActual[0].metadata || {}),
                        ...(datos.metadata || {}),
                        fecha_actualizacion: new Date().toISOString()
                    })
                },
                type: QueryTypes.UPDATE
            });

            return result[0][0];
        } catch (error) {
            console.error('❌ Error en actualizarAnotacion:', error);
            throw new Error(`Error al actualizar anotación: ${error.message}`);
        }
    }

    /**
     * Elimina una anotación (hard delete - tu tabla no tiene eliminación suave)
     */
    async eliminarAnotacion(anotacionId, usuarioId) {
        try {
            // Verificar que la anotación existe y pertenece al usuario
            const checkQuery = `
                SELECT * FROM anotaciones 
                WHERE id = :anotacionId
            `;

            const anotacion = await sequelize.query(checkQuery, {
                replacements: { anotacionId },
                type: QueryTypes.SELECT
            });

            if (anotacion.length === 0) {
                throw new Error('Anotación no encontrada');
            }

            if (anotacion[0].usuario_id !== usuarioId) {
                throw new Error('No tienes permisos para eliminar esta anotación');
            }

            // Eliminar la anotación (hard delete)
            const deleteQuery = `
                DELETE FROM anotaciones 
                WHERE id = :anotacionId
                RETURNING *
            `;

            const result = await sequelize.query(deleteQuery, {
                replacements: { anotacionId },
                type: QueryTypes.DELETE
            });

            return result[0][0];
        } catch (error) {
            console.error('❌ Error en eliminarAnotacion:', error);
            throw new Error(`Error al eliminar anotación: ${error.message}`);
        }
    }

    /**
     * Elimina todas las anotaciones de un archivo para un usuario
     */
    async eliminarAnotacionesPorArchivo(archivoNombre, usuarioId) {
        try {
            const query = `
                DELETE FROM anotaciones 
                WHERE archivo_nombre = :archivoNombre 
                AND usuario_id = :usuarioId
                RETURNING *
            `;

            const result = await sequelize.query(query, {
                replacements: { archivoNombre, usuarioId },
                type: QueryTypes.DELETE
            });

            return result[0];
        } catch (error) {
            console.error('❌ Error en eliminarAnotacionesPorArchivo:', error);
            throw new Error(`Error al eliminar anotaciones por archivo: ${error.message}`);
        }
    }

    /**
     * Vacía los comentarios de una anotación
     */
    async vaciarAnotacion(anotacionId, usuarioId) {
        try {
            // Verificar que la anotación existe y pertenece al usuario
            const checkQuery = `
                SELECT * FROM anotaciones 
                WHERE id = :anotacionId
            `;

            const anotacion = await sequelize.query(checkQuery, {
                replacements: { anotacionId },
                type: QueryTypes.SELECT
            });

            if (anotacion.length === 0) {
                throw new Error('Anotación no encontrada');
            }

            if (anotacion[0].usuario_id !== usuarioId) {
                throw new Error('No tienes permisos para vaciar esta anotación');
            }

            const datosAnteriores = anotacion[0].comentarios || [];
            const nuevaMetadata = {
                ...(anotacion[0].metadata || {}),
                vaciada: true,
                fecha_vaciado: new Date().toISOString(),
                total_comentarios_anteriores: datosAnteriores.length
            };

            // Actualizar la anotación
            const updateQuery = `
                UPDATE anotaciones 
                SET comentarios = '[]'::jsonb, 
                    metadata = :metadata::jsonb
                WHERE id = :anotacionId
                RETURNING *
            `;

            const result = await sequelize.query(updateQuery, {
                replacements: {
                    anotacionId,
                    metadata: JSON.stringify(nuevaMetadata)
                },
                type: QueryTypes.UPDATE
            });

            return result[0][0];
        } catch (error) {
            console.error('❌ Error en vaciarAnotacion:', error);
            throw new Error(`Error al vaciar anotación: ${error.message}`);
        }
    }

    /**
     * Exporta todas las anotaciones de un archivo
     */
    async exportarAnotacionesPorArchivo(archivoNombre, usuarioId) {
        try {
            const anotaciones = await this.obtenerAnotacionesPorArchivo(archivoNombre, usuarioId);

            return {
                metadata: {
                    version: '1.0',
                    fecha_exportacion: new Date().toISOString(),
                    total_anotaciones: anotaciones.length,
                    archivo_nombre: archivoNombre,
                    usuario_id: usuarioId
                },
                anotaciones: anotaciones.map(anot => ({
                    id: anot.id,
                    archivo_nombre: anot.archivo_nombre,
                    documento_url: anot.documento_url,
                    usuario_id: anot.usuario_id,
                    comentarios: anot.comentarios,
                    metadata: anot.metadata,
                    created_at: anot.created_at
                }))
            };
        } catch (error) {
            console.error('❌ Error en exportarAnotacionesPorArchivo:', error);
            throw new Error(`Error al exportar anotaciones por archivo: ${error.message}`);
        }
    }

    /**
     * Verifica si existe la tabla de anotaciones
     */
    async verificarTablaAnotaciones() {
        try {
            const query = `
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'anotaciones'
                )
            `;

            const result = await sequelize.query(query, {
                type: QueryTypes.SELECT
            });

            return result[0].exists;
        } catch (error) {
            console.error('❌ Error al verificar tabla anotaciones:', error);
            return false;
        }
    }

    /**
     * Obtiene todas las anotaciones de un usuario
     */
    async obtenerAnotacionesPorUsuario(usuarioId) {
        try {
            const query = `
                SELECT * FROM anotaciones 
                WHERE usuario_id = :usuarioId
                ORDER BY created_at DESC
            `;

            const result = await sequelize.query(query, {
                replacements: { usuarioId },
                type: QueryTypes.SELECT
            });

            return result;
        } catch (error) {
            console.error('❌ Error en obtenerAnotacionesPorUsuario:', error);
            throw new Error(`Error al obtener anotaciones del usuario: ${error.message}`);
        }
    }
    /**
 * Obtiene anotaciones por archivo sin filtrar por usuario
 */
    async obtenerAnotacionesPorArchivoSinUsuario(archivoNombre) {
        try {
            console.log('🔍 Obteniendo todas las anotaciones por archivo:', archivoNombre);

            const query = `
            SELECT * FROM anotaciones 
            WHERE archivo_nombre = :archivoNombre
            ORDER BY created_at DESC
        `;

            const result = await sequelize.query(query, {
                replacements: { archivoNombre },
                type: QueryTypes.SELECT
            });

            console.log('📊 Total anotaciones encontradas:', result.length);
            return result;
        } catch (error) {
            console.error('❌ Error en obtenerAnotacionesPorArchivoSinUsuario:', error);
            throw new Error(`Error al obtener anotaciones por archivo: ${error.message}`);
        }
    }
    async obtenerPorArchivoTodos(req, res) {
        try {
            const { nombreArchivo } = req.params;

            const anotaciones = await anotacionService.obtenerAnotacionesPorArchivoSinUsuario(
                nombreArchivo
            );

            res.status(200).json({
                success: true,
                message: 'Anotaciones obtenidas correctamente',
                data: anotaciones
            });
        } catch (error) {
            console.error('Error al obtener anotaciones por archivo:', error);
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
    async eliminarPorArchivo(archivoNombre) {
        try {
            const query = `
                DELETE FROM anotaciones 
                WHERE archivo_nombre = :archivoNombre
                RETURNING *
            `;
            const result = await sequelize.query(query, {
                replacements: { archivoNombre },
                type: QueryTypes.DELETE
            });
            return result[0];
        } catch (error) {
            console.error('❌ Error en eliminarPorArchivo:', error);
            throw new Error(`Error al eliminar anotaciones por archivo: ${error.message}`);
        }
    }
    async eliminarAnotacionesPorDocumento(documentoId) {
        try {
            const query = `
                DELETE FROM anotaciones 
                WHERE metadata->>'documento_id' = :documentoId
                RETURNING *
            `;
            const result = await sequelize.query(query, {
                replacements: { documentoId: documentoId.toString() },
                type: QueryTypes.DELETE
            });
            return result[0];
        } catch (error) {
            console.error('❌ Error en eliminarAnotacionesPorDocumento:', error);
            throw new Error(`Error al eliminar anotaciones por documento: ${error.message}`);
        }
    }
}

module.exports = new AnotacionService();
