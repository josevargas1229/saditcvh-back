/**
 * SERVICIO: AuditService
 * DESCRIPCIÓN: Motor centralizado para el registro de bitácora de acciones.
 */
const AuditLog = require("../models/auditLog.model"); 
const { parseUserAgent } = require("../../../utils/userAgentParser");

/**
 * Registra de forma asíncrona una acción en la bitácora de auditoría.
 * Extrae contexto de red y usuario del objeto 'req'.
 * * @param {Object} req - Objeto de petición Express.
 * @param {Object} params - Configuración del log.
 * @param {string} params.action - Verbo de la acción (p.ej. 'DOWNLOAD').
 * @param {string} params.module - Área del sistema (p.ej. 'DOCUMENTS').
 * @param {string|number} [params.entityId] - ID del objeto afectado.
 * @param {Object} [params.details] - Datos adicionales para humanizar el registro.
 */
exports.createLog = async (req, { action, module, entityId = null, details = {} }) => {
    try {
        // 1. Identificación del actor (Sesión)
        const userId = req.user ? req.user.id : null;

        // 2. Contexto técnico (Red y Dispositivo)
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const userAgentRaw = req.headers['user-agent'];
        const device = parseUserAgent(userAgentRaw);

        // 3. Preparación del registro inmutable
        const logData = {
            user_id: userId,
            action: action.toUpperCase(),
            module: module.toUpperCase(),
            entity_id: entityId ? String(entityId) : null,
            ip_address: ipAddress,
            user_agent: userAgentRaw,
            details: {
                ...details,
                device_detected: device
            }
        };

        /**
         * Ejecución asíncrona: No usamos 'await' para la creación del registro
         * para no penalizar el tiempo de respuesta del usuario final.
         */
        AuditLog.create(logData).catch(err => {
            console.error("ERROR CRÍTICO (Bitácora): No se pudo persistir el log.", err);
        });

    } catch (error) {
        // Fallo silencioso: La bitácora no debe interrumpir el flujo del sistema
        console.error("Error en motor de auditoría:", error);
    }
};

/**
 * Recupera logs de auditoría con soporte para filtros y paginación.
 * (Útil para la Fase 4)
 */
exports.getAuditLogs = async (query) => {
    // Aquí irá la lógica para el Centro de Auditoría (Frontend)
};