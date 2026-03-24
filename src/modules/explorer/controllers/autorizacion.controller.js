const AutorizacionService = require('../services/autorizacion.service');
const auditService = require("../../audit/services/audit.service");
class AutorizacionController {
    constructor() {
        this.autorizacionService = new AutorizacionService();
    }
    // Buscar autorizaciones avanzada
    buscarAutorizaciones = async (req, res) => {
        try {
            const {
                search,
                campos = [],
                exactMatch = false
            } = req.body;
            const { page = 1, limit = 10 } = req.query;

            const result = await this.autorizacionService.buscarAutorizaciones({
                search,
                campos,
                exactMatch,
                page: parseInt(page),
                limit: parseInt(limit)
            });

            res.status(200).json({
                success: true,
                message: 'Búsqueda completada exitosamente',
                data: result.autorizaciones,
                pagination: {
                    currentPage: result.currentPage,
                    totalPages: result.totalPages,
                    totalItems: result.totalItems,
                    itemsPerPage: result.itemsPerPage
                }
            });
        } catch (error) {
            res.status(error.status || 500).json({
                success: false,
                message: error.message || 'Error en la búsqueda',
                error: error.errors || error
            });
        }
    };
    // Obtener todas las autorizaciones
    obtenerAutorizaciones = async (req, res) => {
        try {
            const {
                page = 1,
                limit = 10,
                sortBy = 'id',
                sortOrder = 'DESC',
                search,
                estado,
                municipioId,
                modalidadId,
                tipoId
            } = req.query;

            const options = {
                page: parseInt(page),
                limit: parseInt(limit),
                sortBy,
                sortOrder,
                search,
                filters: {}
            };

            if (estado) options.filters.estado = estado;
            if (municipioId) options.filters.municipioId = municipioId;
            if (modalidadId) options.filters.modalidadId = modalidadId;
            if (tipoId) options.filters.tipoId = tipoId;
            const result = await this.autorizacionService.obtenerAutorizaciones(options);

            res.status(200).json({
                success: true,
                message: 'Autorizaciones obtenidas exitosamente',
                data: result.autorizaciones,
                pagination: {
                    currentPage: result.currentPage,
                    totalPages: result.totalPages,
                    totalItems: result.totalItems,
                    itemsPerPage: result.itemsPerPage
                }
            });
        } catch (error) {
            res.status(error.status || 500).json({
                success: false,
                message: error.message || 'Error al obtener autorizaciones',
                error: error.errors || error
            });
        }
    };
    // Crear una nueva autorización
    crearAutorizacion = async (req, res) => {
        const userId = req.user?.id || null;
        try {
            const autorizacionData = req.body;
            const autorizacion = await this.autorizacionService.crearAutorizacion(autorizacionData);
            await auditService.createLog(req, {
                action: 'CREATE_AUTORIZACION',
                module: 'Autorizaciones',
                entityId: autorizacion.id, // autorización creada
                details: {
                    message: 'Autorización creada exitosamente',
                    autorizacionId: autorizacion.id,
                    autorizacion: autorizacion.nombreCarpeta,
                    createdBy: userId,
                    status: 'SUCCESS'
                }
            });
            res.status(201).json({
                success: true,
                message: 'Autorización creada exitosamente',
                data: autorizacion
            });
        }
        catch (error) {
            await auditService.createLog(req, {
                action: 'CREATE_AUTORIZACION',
                module: 'Autorizaciones',
                entityId: null,
                details: {
                    message: 'Error al crear autorización',
                    error: error.message,
                    createdBy: userId,
                    status: 'ERROR'
                }
            });
            res.status(error.status || 500).json({
                success: false,
                message: error.message || 'Error al crear autorización',
                error: error.errors || error
            });
        }
    };
    // crearAutorizacion = async (req, res) => {
    //     try {
    //         const autorizacionData = req.body;

    //         const autorizacion = await this.autorizacionService.crearAutorizacion(autorizacionData);
    //         res.status(201).json({
    //             success: true,
    //             message: 'Autorización creada exitosamente',
    //             data: autorizacion
    //         });
    //     } catch (error) {
    //         res.status(error.status || 500).json({
    //             success: false,
    //             message: error.message || 'Error al crear autorización',
    //             error: error.errors || error
    //         });
    //     }
    // };


    // Obtener autorización por ID
    obtenerAutorizacionPorId = async (req, res) => {
        try {
            const { id } = req.params;
            const includeRelations = req.query.include === 'true';

            const autorizacion = await this.autorizacionService.obtenerAutorizacionPorId(id, includeRelations);

            res.status(200).json({
                success: true,
                message: 'Autorización obtenida exitosamente',
                data: autorizacion
            });
        } catch (error) {
            res.status(error.status || 500).json({
                success: false,
                message: error.message || 'Error al obtener autorización',
                error: error.errors || error
            });
        }
    };

    // Obtener autorización por número
    obtenerAutorizacionPorNumero = async (req, res) => {
        try {
            const { numero } = req.params;
            const autorizacion = await this.autorizacionService.obtenerAutorizacionPorNumero(numero);

            res.status(200).json({
                success: true,
                message: 'Autorización obtenida exitosamente',
                data: autorizacion
            });
        } catch (error) {
            res.status(error.status || 500).json({
                success: false,
                message: error.message || 'Error al obtener autorización',
                error: error.errors || error
            });
        }
    };

    // Actualizar autorización
    actualizarAutorizacion = async (req, res) => {
        try {
            const { id } = req.params;
            const autorizacionData = req.body;

            const autorizacion = await this.autorizacionService.actualizarAutorizacion(id, autorizacionData);

            res.status(200).json({
                success: true,
                message: 'Autorización actualizada exitosamente',
                data: autorizacion
            });
        } catch (error) {
            res.status(error.status || 500).json({
                success: false,
                message: error.message || 'Error al actualizar autorización',
                error: error.errors || error
            });
        }
    };

    // Eliminar autorización (soft delete)
    eliminarAutorizacion = async (req, res) => {
        const userId = req.user?.id || null;

        try {
            const { id } = req.params;

            await this.autorizacionService.eliminarAutorizacion(id);

            // AUDITORÍA - ÉXITO
            await auditService.createLog(req, {
                action: 'DELETE_AUTORIZACION',
                module: 'Autorizaciones',
                entityId: id,
                details: {
                    message: 'Autorización eliminada exitosamente',
                    autorizacionId: id,
                    deletedBy: userId,
                    status: 'SUCCESS'
                }
            });

            res.status(200).json({
                success: true,
                message: 'Autorización eliminada exitosamente'
            });

        } catch (error) {

            // AUDITORÍA - ERROR
            await auditService.createLog(req, {
                action: 'DELETE_AUTORIZACION',
                module: 'Autorizaciones',
                entityId: req.params.id || null,
                details: {
                    message: 'Error al eliminar autorización',
                    error: error.message,
                    deletedBy: userId,
                    status: 'ERROR'
                }
            });

            res.status(error.status || 500).json({
                success: false,
                message: error.message || 'Error al eliminar autorización',
                error: error.errors || error
            });
        }
    };


    // Activar/Desactivar autorización
    cambiarEstadoAutorizacion = async (req, res) => {
        try {
            const { id } = req.params;
            const { activo } = req.body;

            const autorizacion = await this.autorizacionService.cambiarEstadoAutorizacion(id, activo);

            res.status(200).json({
                success: true,
                message: `Autorización ${activo ? 'activada' : 'desactivada'} exitosamente`,
                data: autorizacion
            });
        } catch (error) {
            res.status(error.status || 500).json({
                success: false,
                message: error.message || 'Error al cambiar estado de autorización',
                error: error.errors || error
            });
        }
    };

    // Generar reporte de autorizaciones
    generarReporteAutorizaciones = async (req, res) => {
        try {
            const { fechaInicio, fechaFin, municipioId, modalidadId, tipoId } = req.query;

            const reporte = await this.autorizacionService.generarReporteAutorizaciones({
                fechaInicio,
                fechaFin,
                municipioId,
                modalidadId,
                tipoId
            });

            res.status(200).json({
                success: true,
                message: 'Reporte generado exitosamente',
                data: reporte
            });
        } catch (error) {
            res.status(error.status || 500).json({
                success: false,
                message: error.message || 'Error al generar reporte',
                error: error.errors || error
            });
        }
    };


}

module.exports = AutorizacionController;
