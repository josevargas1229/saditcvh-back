// src/modules/audit/services/audit.service.js
const { parseUserAgent } = require("../../../utils/userAgentParser");
const { Op } = require("sequelize");

// NO importamos modelos aquí arriba para evitar el ciclo

exports.createLog = async (req, { action, module, entityId = null, details = {} }) => {
    // Importación dinámica local
    const { AuditLog } = require("../../../database/associations");
    try {
        const userId = req.user ? req.user.id : null;
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const userAgentRaw = req.headers['user-agent'];
        const device = parseUserAgent(userAgentRaw);

        const logData = {
            user_id: userId,
            action: action.toUpperCase(),
            module: module.toUpperCase(),
            entity_id: entityId ? String(entityId) : null,
            ip_address: ipAddress,
            user_agent: userAgentRaw,
            details: { ...details, device_detected: device }
        };

        AuditLog.create(logData).catch(err => console.error("ERROR CRÍTICO (Bitácora):", err));
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