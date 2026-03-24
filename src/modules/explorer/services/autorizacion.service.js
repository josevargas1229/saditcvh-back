const Autorizacion = require('../models/autorizacion.model');
const {
	Municipio
} = require("../../../database/associations");
const Modalidad = require('../models/Modalidad.model');
const TiposAutorizacion = require('../models/TiposAutorizacion.model');
const Documento = require('../models/documento.model');
const {
	Op
} = require('sequelize');
class AutorizacionService {
	constructor() {
		this.autorizacionModel = Autorizacion;
		this.municipioModel = Municipio;
		this.modalidadModel = Modalidad;
		this.tiposAutorizacionModel = TiposAutorizacion;
		this.documentoModel = Documento;
	}
	// Obtener todas las autorizaciones con paginación
	obtenerAutorizaciones = async (options = {}) => {
		try {
			const {
				page = 1,
					limit = 10,
					sortBy = 'id',
					sortOrder = 'DESC',
					search,
					filters = {}
			} = options;
			const offset = (page - 1) * limit;
			const whereClause = {};
			// Aplicar filtros
			if(filters.estado) whereClause.estado = filters.estado;
			if(filters.municipioId) whereClause.municipioId = filters.municipioId;
			if(filters.modalidadId) whereClause.modalidadId = filters.modalidadId;
			if(filters.tipoId) whereClause.tipoId = filters.tipoId;
			if(filters.activo !== undefined) whereClause.activo = filters.activo;
			console.log("search****")
			console.log(search)
			// Búsqueda por texto
			if(search) {
				whereClause[Op.or] = [{
					numeroAutorizacion: {
						[Op.iLike]: `%${search}%`
					}
				}, {
					nombreCarpeta: {
						[Op.iLike]: `%${search}%`
					}
				}, {
					solicitante: {
						[Op.iLike]: `%${search}%`
					}
				}];
			}
			// Obtener total de registros
			const totalItems = await this.autorizacionModel.count({
				where: whereClause
			});
			// Obtener autorizaciones con relaciones
			const autorizaciones = await this.autorizacionModel.findAll({
				where: whereClause,
				include: [{
					model: this.municipioModel,
					as: 'municipio',
					attributes: ['id', 'num', 'nombre']
				}, {
					model: this.modalidadModel,
					as: 'modalidad',
					attributes: ['id', 'num', 'nombre']
				}, {
					model: this.tiposAutorizacionModel,
					as: 'tipoAutorizacion',
					attributes: ['id', 'nombre', 'abreviatura']
				}],
				order: [
					[sortBy, sortOrder]
				],
				limit: parseInt(limit),
				offset: offset,
				attributes: {
					exclude: ['createdAt', 'updatedAt']
				}
			});
			return {
				autorizaciones,
				currentPage: page,
				totalPages: Math.ceil(totalItems / limit),
				totalItems,
				itemsPerPage: limit
			};
		}
		catch (error) {
			console.error('Error en obtenerAutorizaciones:', error);
			throw error;
		}
	};
	// Crear autorización
crearAutorizacion = async (autorizacionData) => {
  try {
   
    const data = {
      numeroAutorizacion: autorizacionData.numero_autorizacion,
      consecutivo1: autorizacionData.consecutivo1,
      consecutivo2: autorizacionData.consecutivo2,
    //   nombreCarpeta, //  OBLIGATORIO
      solicitante: autorizacionData.solicitante,
      municipioId: autorizacionData.municipio_id,
      modalidadId: autorizacionData.modalidad_id,
      tipoId: autorizacionData.tipo_id,
      activo: true,
    //   fechaSolicitud: autorizacionData.fecha_solicitud || new Date(),
    //   fechaCreacion: new Date()
    };

    return await this.autorizacionModel.create(data);
  } catch (error) {
    console.error('Error en crearAutorizacion:', error);
    throw error;
  }
};


	buscarAutorizaciones = async (opciones = {}) => {
		try {
			const {
				search,
				campos = [],
				exactMatch = false,
				page = 1,
				limit = 10
			} = opciones;

			if(!search) {
				throw {
					status: 400,
					message: 'Término de búsqueda requerido'
				};
			}

			const offset = (page - 1) * limit;

			const normalizarNombreCarpeta = (texto) => {
				return texto.replace(/[-\s]/g, '_').replace(/_/g, '\\_');
			};

			const searchCondition = exactMatch ? search : {
				[Op.iLike]: `%${search}%`
			};

			const whereClause = {
				[Op.or]: []
			};

			const validFields = ['numeroAutorizacion', 'nombreCarpeta', 'solicitante', 'estado'];

			if(campos.length > 0) {
				campos.forEach(campo => {
					if(!validFields.includes(campo)) return;
					if(campo === 'nombreCarpeta') {
						const normalized = normalizarNombreCarpeta(search);
						whereClause[Op.or].push({
							nombreCarpeta: {
								[Op.iLike]: `%${normalized}%`
							}
						});
					}
					else {
						whereClause[Op.or].push({
							[campo]: searchCondition
						});
					}
				});
			}
			else {
				const normalized = normalizarNombreCarpeta(search);
				whereClause[Op.or] = [{
					numeroAutorizacion: searchCondition
				}, {
					nombreCarpeta: {
						[Op.iLike]: `%${normalized}%`
					}
				}, {
					solicitante: searchCondition
				}, {
					'$municipio.nombre$': searchCondition
				}, {
					'$modalidad.nombre$': searchCondition
				}, {
					'$tipoAutorizacion.nombre$': searchCondition
				}];
			}

			const totalItems = await this.autorizacionModel.count({
				where: whereClause,
				include: [{
					model: this.municipioModel,
					as: 'municipio',
					required: false
				}, {
					model: this.modalidadModel,
					as: 'modalidad',
					required: false
				}, {
					model: this.tiposAutorizacionModel,
					as: 'tipoAutorizacion',
					required: false
				}]
			});

			const autorizaciones = await this.autorizacionModel.findAll({
				where: whereClause,
				include: [{
					model: this.municipioModel,
					as: 'municipio',
					attributes: ['id', 'num', 'nombre'],
					required: false
				}, {
					model: this.modalidadModel,
					as: 'modalidad',
					attributes: ['id', 'num', 'nombre'],
					required: false
				}, {
					model: this.tiposAutorizacionModel,
					as: 'tipoAutorizacion',
					attributes: ['id', 'nombre', 'abreviatura'],
					required: false
				}],
				limit: parseInt(limit),
				offset: offset,
				order: [
					['id', 'DESC']
				],
				attributes: {
					exclude: ['createdAt', 'updatedAt']
				}
			});

			return {
				autorizaciones,
				currentPage: page,
				totalPages: Math.ceil(totalItems / limit),
				totalItems,
				itemsPerPage: limit
			};
		}
		catch (error) {
			console.error('Error en buscarAutorizaciones:', error);
			throw error;
		}
	};
	// Obtener autorización por ID
	obtenerAutorizacionPorId = async (id, includeRelations = false) => {
		try {
			const include = [];
			if(includeRelations) {
				include.push({
					model: this.municipioModel,
					as: 'municipio',
					attributes: ['id', 'num', 'nombre']
				}, {
					model: this.modalidadModel,
					as: 'modalidad',
					attributes: ['id', 'num', 'nombre']
				}, {
					model: this.tiposAutorizacionModel,
					as: 'tipoAutorizacion',
					attributes: ['id', 'nombre', 'abreviatura']
				}, {
					model: this.documentoModel,
					as: 'documentos',
					attributes: ['id', 'titulo', 'numeroDocumento', 'fechaDocumento', 'estadoDigitalizacion']
				});
			}
			const autorizacion = await this.autorizacionModel.findByPk(id, {
				include: include,
				attributes: {
					exclude: ['createdAt', 'updatedAt']
				}
			});
			if(!autorizacion) {
				throw {
					status: 404,
					message: 'Autorización no encontrada'
				};
			}
			return autorizacion;
		}
		catch (error) {
			console.error('Error en obtenerAutorizacionPorId:', error);
			throw error;
		}
	};
	// Obtener autorización por número
	obtenerAutorizacionPorNumero = async (numero) => {
		try {
			const autorizacion = await this.autorizacionModel.findOne({
				where: {
					[Op.or]: [
						{ numeroAutorizacion: numero },
						{ nombreCarpeta: numero }
					]
				},
				include: [{
					model: this.municipioModel,
					as: 'municipio',
					attributes: ['id', 'num', 'nombre']
				}, {
					model: this.modalidadModel,
					as: 'modalidad',
					attributes: ['id', 'num', 'nombre']
				}, {
					model: this.tiposAutorizacionModel,
					as: 'tipoAutorizacion',
					attributes: ['id', 'nombre', 'abreviatura']
				}],
				attributes: {
					exclude: ['createdAt', 'updatedAt']
				}
			});
			if(!autorizacion) {
				throw {
					status: 404,
					message: 'Autorización no encontrada'
				};
			}
			return autorizacion;
		}
		catch (error) {
			console.error('Error en obtenerAutorizacionPorNumero:', error);
			throw error;
		}
	};
	// Actualizar autorización
	actualizarAutorizacion = async (id, autorizacionData) => {
		try {
			// Verificar si existe la autorización
			const autorizacion = await this.autorizacionModel.findByPk(id);
			if(!autorizacion) {
				throw {
					status: 404,
					message: 'Autorización no encontrada'
				};
			}
			// Verificar si se está cambiando el número y ya existe
			if(autorizacionData.numeroAutorizacion && autorizacionData.numeroAutorizacion !== autorizacion.numeroAutorizacion) {
				const existeNumero = await this.autorizacionModel.findOne({
					where: {
						numeroAutorizacion: autorizacionData.numeroAutorizacion,
						id: {
							[Op.ne]: id
						}
					}
				});
				if(existeNumero) {
					throw {
						status: 400,
						message: 'Ya existe otra autorización con este número'
					};
				}
			}
			// Actualizar autorización
			await autorizacion.update(autorizacionData);
			// Obtener autorización actualizada con relaciones
			const autorizacionActualizada = await this.obtenerAutorizacionPorId(id, true);
			return autorizacionActualizada;
		}
		catch (error) {
			console.error('Error en actualizarAutorizacion:', error);
			throw error;
		}
	};
	// Eliminar autorización
	eliminarAutorizacion = async (id) => {
		try {
			const autorizacion = await this.autorizacionModel.findByPk(id);
			if(!autorizacion) {
				throw {
					status: 404,
					message: 'Autorización no encontrada'
				};
			}
			await autorizacion.destroy();
			return true;
		}
		catch (error) {
			console.error('Error en eliminarAutorizacion:', error);
			throw error;
		}
	};
	// Cambiar estado activo/inactivo
	cambiarEstadoAutorizacion = async (id, activo) => {
		try {
			const autorizacion = await this.autorizacionModel.findByPk(id);
			if(!autorizacion) {
				throw {
					status: 404,
					message: 'Autorización no encontrada'
				};
			}
			await autorizacion.update({
				activo
			});
			return autorizacion;
		}
		catch (error) {
			console.error('Error en cambiarEstadoAutorizacion:', error);
			throw error;
		}
	};
	// Generar reporte de autorizaciones
	generarReporteAutorizaciones = async (filtros = {}) => {
		try {
			const whereClause = {};
			// Aplicar filtros de fechas
			if(filtros.fechaInicio && filtros.fechaFin) {
				whereClause.fechaCreacion = {
					[Op.between]: [filtros.fechaInicio, filtros.fechaFin]
				};
			}
			else if(filtros.fechaInicio) {
				whereClause.fechaCreacion = {
					[Op.gte]: filtros.fechaInicio
				};
			}
			else if(filtros.fechaFin) {
				whereClause.fechaCreacion = {
					[Op.lte]: filtros.fechaFin
				};
			}
			// Otros filtros
			if(filtros.municipioId) whereClause.municipioId = filtros.municipioId;
			if(filtros.modalidadId) whereClause.modalidadId = filtros.modalidadId;
			if(filtros.tipoId) whereClause.tipoId = filtros.tipoId;
			// Obtener estadísticas
			const total = await this.autorizacionModel.count({
				where: whereClause
			});
			const activas = await this.autorizacionModel.count({
				where: {
					...whereClause,
					activo: true
				}
			});
			const inactivas = await this.autorizacionModel.count({
				where: {
					...whereClause,
					activo: false
				}
			});
			// Obtear por tipo de estado
			const porEstado = await this.autorizacionModel.findAll({
				where: whereClause,
				attributes: ['estado',
					[this.autorizacionModel.sequelize.fn('COUNT', this.autorizacionModel.sequelize.col('id')), 'cantidad']
				],
				group: ['estado']
			});
			// Obtener por municipio
			const porMunicipio = await this.autorizacionModel.findAll({
				where: whereClause,
				include: [{
					model: this.municipioModel,
					as: 'municipio',
					attributes: ['nombre']
				}],
				attributes: ['municipioId',
					[this.autorizacionModel.sequelize.fn('COUNT', this.autorizacionModel.sequelize.col('id')), 'cantidad']
				],
				group: ['municipioId', 'municipio.nombre']
			});
			return {
				estadisticas: {
					total,
					activas,
					inactivas
				},
				distribucionPorEstado: porEstado,
				distribucionPorMunicipio: porMunicipio,
				periodo: {
					fechaInicio: filtros.fechaInicio || null,
					fechaFin: filtros.fechaFin || null
				}
			};
		}
		catch (error) {
			console.error('Error en generarReporteAutorizaciones:', error);
			throw error;
		}
	};
}
module.exports = AutorizacionService;
