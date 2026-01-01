const { parseUserAgent } = require("../../../utils/userAgentParser");
const { Op } = require("sequelize");

/**
 * ============================================================
 * SERVICIO DE AUDITORÍA – createLog
 * ============================================================
 *
 * Este servicio centraliza la creación de registros de auditoría
 * (bitácora) para TODA la aplicación.
 *
 *  IMPORTANTE:
 * - Este método NO debe lanzar errores hacia el flujo principal.
 * - Cualquier error interno se captura y se loggea en consola.
 * - La operación principal (crear/editar/eliminar/obtener) NUNCA debe fallar
 *   por un problema de auditoría.
 *
 * ------------------------------------------------------------
 * ¿CUÁNDO USAR ESTE SERVICIO?
 * ------------------------------------------------------------
 * - Acciones CREATE / UPDATE / DELETE
 * - Cambios de permisos, roles o matrices
 * - Acciones administrativas sensibles
 * - Procesos automáticos que deban dejar trazabilidad
 *
 *  * ------------------------------------------------------------
 * ESTRUCTURA GENERAL DEL LOG
 * ------------------------------------------------------------
 * {
 *   user_id,
 *   action,        // Convención lógica (VIEW, EDIT, DELETE, etc.)
 *   module,        // Convención lógica (USERS, DOCUMENTS, ...)
 *   entity_id,
 *   ip_address,
 *   user_agent,
 *   details        // JSON libre (NO indexado)
 * }
 *
 * NOTA PARA DESARROLLADORES:
 * - Los ejemplos son REFERENCIALES.
 * - No es obligatorio registrar todos los campos.
 * - Registra solo información confiable y disponible.
 *
 *  SEGURIDAD:
 * Nunca incluir contraseñas, tokens o secretos en `details`.
 *
 * ============================================================
 * EJEMPLOS PARA EL MÓDULO: DOCUMENTS
 * ============================================================
 *
 * IMPORTANTE:
 * El backend NO obliga qué campos guardar.
 * Cada equipo de módulo decide qué nivel de trazabilidad necesita.
 *
 * ------------------------------------------------------------
 * VER DOCUMENTO (VIEW)
 * ------------------------------------------------------------
 * Uso típico: registrar que un usuario accedió al contenido.
 * Métricas avanzadas (tiempo, páginas) son OPCIONALES.
 *
 * await auditService.createLog(req, {
 *   action: 'VIEW',
 *   module: 'DOCUMENTS',
 *   entityId: document.id,
 *   details: {
 *     file_name: document.name,
 *
 *     // OPCIONAL (si el frontend lo calcula)
 *     view_duration: '4m 20s',
 *     pages_viewed: [1, 2, 5]
 *   }
 * });
 *
 * ------------------------------------------------------------
 * DESCARGAR DOCUMENTO (DOWNLOAD)
 * ------------------------------------------------------------
 *
 * await auditService.createLog(req, {
 *   action: 'DOWNLOAD',
 *   module: 'DOCUMENTS',
 *   entityId: document.id,
 *   details: {
 *     file_name: document.name,
 *     file_size: '12.4 MB',
 *     format: 'PDF',
 *     status: 'COMPLETED'
 *   }
 * });
 *
 * ------------------------------------------------------------
 * IMPRIMIR DOCUMENTO (PRINT)
 * ------------------------------------------------------------
 *
 * await auditService.createLog(req, {
 *   action: 'PRINT',
 *   module: 'DOCUMENTS',
 *   entityId: document.id,
 *   details: {
 *     file_name: document.name,
 *     pages: 3,
 *     copies: 1,
 *     printer_name: 'HP-LaserJet-Oficina'
 *   }
 * });
 *
 * ------------------------------------------------------------
 * EDITAR DOCUMENTO (EDIT)
 * ------------------------------------------------------------
 * Recomendado: indicar QUÉ cambió y POR QUÉ.
 *
 * await auditService.createLog(req, {
 *   action: 'EDIT',
 *   module: 'DOCUMENTS',
 *   entityId: document.id,
 *   details: {
 *     file_name: document.name,
 *     changes: {
 *       field: 'category',
 *       old: 'Borradores',
 *       new: 'Oficiales'
 *     },
 *     reason: 'Aprobación administrativa'
 *   }
 * });
 *
 * ------------------------------------------------------------
 * ELIMINAR DOCUMENTO (DELETE)
 * ------------------------------------------------------------
 *
 * await auditService.createLog(req, {
 *   action: 'DELETE',
 *   module: 'DOCUMENTS',
 *   entityId: document.id,
 *   details: {
 *     file_name: document.name,
 *     reason: 'Depuración anual',
 *     backup_created: true
 *   }
 * });
 *
 * ============================================================
 * 
 * ------------------------------------------------------------
 * PARÁMETROS
 * ------------------------------------------------------------
 * @param {Object} req - Request de Express (obligatorio)
 *   Se usa para:
 *   - Identificar al usuario autenticado
 *   - Obtener IP real
 *   - Detectar dispositivo / navegador
 *
 * @param {Object} payload
 * @param {String} payload.action   - Acción ejecutada (CREATE, UPDATE, DELETE, LOGIN, etc.)
 * @param {String} payload.module   - Módulo lógico (USERS, ROLES, PERMISSIONS, etc.)
 * @param {String|Number|null} payload.entityId - ID de la entidad afectada
 * @param {Object} payload.details  - Información adicional (changes, data, etc.)
 */

exports.createLog = async (req, { action, module, entityId = null, details = {} }) => {
    // Importación dinámica para evitar dependencias circulares
    const { AuditLog } = require("../../../database/associations");

    try {
        const userId = req.user ? req.user.id : null;

        // IP real (soporte proxy / load balancer)
        const ipAddress =
            req.ip ||
            req.headers['x-forwarded-for'] ||
            req.socket.remoteAddress;

        const userAgentRaw = req.headers['user-agent'];
        const device = parseUserAgent(userAgentRaw);

        const logData = {
            user_id: userId,
            action: action.toUpperCase(),
            module: module.toUpperCase(),
            entity_id: entityId ? String(entityId) : null,
            ip_address: ipAddress,
            user_agent: userAgentRaw,

            /**
             * details:
             * - changes: cambios detectados
             * - data: snapshot al crear
             * - display_name: nombre legible para UI
             * - device_detected: info del navegador/dispositivo
             */
            details: {
                ...details,
                device_detected: device
            }
        };

        // No await: auditoría NO bloqueante
        AuditLog.create(logData)
            .catch(err => console.error("ERROR CRÍTICO (Bitácora):", err));

    } catch (error) {
        console.error("Error en motor de auditoría:", error);
    }
};


exports.getAuditLogs = async (filters) => {
    const { AuditLog, User, Role } = require("../../../database/associations");
    
    const { 
        page = 1, limit = 20, module, action, search, 
        startDate, endDate, roleId, sort = 'DESC' 
    } = filters;
    
    const offset = (page - 1) * limit;
    const where = {};

    // Filtros directos (Muy rápidos por tus índices)
    if (module && module !== 'ALL') where.module = module;
    if (action) where.action = action;
    if (startDate || endDate) {
        where.created_at = {};
        if (startDate) {
            // Desde el primer segundo del día: 00:00:00
            const start = new Date(startDate);
            start.setUTCHours(0, 0, 0, 0);
            where.created_at[Op.gte] = start;
        }
        if (endDate) {
            // Hasta el último milisegundo del día: 23:59:59.999
            const end = new Date(endDate);
            end.setUTCHours(23, 59, 59, 999);
            where.created_at[Op.lte] = end;
        }
    }

    // Construcción de la búsqueda
    const searchWhere = [];
    if (search) {
        searchWhere.push({ action: { [Op.iLike]: `%${search}%` } });
        searchWhere.push({ entity_id: { [Op.iLike]: `%${search}%` } });
        // Solo buscamos en username si el search no es vacío
        searchWhere.push({ '$user.username$': { [Op.iLike]: `%${search}%` } });
        where[Op.or] = searchWhere;
    }

    return await AuditLog.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', sort.toUpperCase() === 'ASC' ? 'ASC' : 'DESC']],
        attributes: ['id', 'user_id', 'action', 'module', 'entity_id', 'ip_address', 'created_at'],
        // Optimizamos el subQuery para que no se alente con el count
        subQuery: false, 
        include: [{
            model: User,
            as: 'user',
            attributes: ['username','first_name', 'last_name'],
            // Si hay RoleId, forzamos INNER JOIN para filtrar
            required: (roleId && roleId !== 'ALL') || (search ? true : false), 
            include: (roleId && roleId !== 'ALL') ? [{
                model: Role,
                as: 'roles',
                where: { id: roleId },
                attributes: [], // No necesitamos los nombres de los roles en la lista
                through: { attributes: [] }
            }] : []
        }]
    });
};

exports.getAuditLogById = async (id) => {
    const { AuditLog, User, Role } = require("../../../database/associations");
    return await AuditLog.findByPk(id, {
        include: [{ 
            model: User, 
            as: 'user',
            attributes: ['id', 'username', 'first_name', 'last_name', 'email'],
            include: [{
                model: Role,
                as: 'roles',
                attributes: ['name'],
                through: { attributes: [] }
            }]
        }]
    });
};