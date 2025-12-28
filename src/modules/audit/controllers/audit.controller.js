/**
 * CONTROLADOR: AuditController
 * DESCRIPCIÓN: Punto de entrada para la consulta de trazabilidad y logs.
 */
const { AuditLog, User } = require("../../../database/associations");
const { Op } = require("sequelize");

exports.getLogs = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const { module, action, search, startDate, endDate } = req.query;

        // 1. Construcción dinámica de filtros
        const where = {};
        
        if (module && module !== 'ALL') where.module = module;
        if (action) where.action = action;
        
        // Filtro por rango de fechas (útil para reportes)
        if (startDate && endDate) {
            where.created_at = {
                [Op.between]: [new Date(startDate), new Date(endDate)]
            };
        }

        // Búsqueda global (en acción, ID de entidad o username del usuario relacionado)
        const whereUser = {};
        if (search) {
            where[Op.or] = [
                { action: { [Op.iLike]: `%${search}%` } },
                { entity_id: { [Op.iLike]: `%${search}%` } },
                { '$user.username$': { [Op.iLike]: `%${search}%` } } // Búsqueda por el JOIN
            ];
        }

        // 2. Consulta con Eager Loading (JOIN)
        const { count, rows } = await AuditLog.findAndCountAll({
            where,
            limit,
            offset,
            order: [['created_at', 'DESC']],
            include: [{ 
                model: User, 
                as: 'user', 
                attributes: ['id', 'username', 'first_name', 'last_name', 'email'],
                required: false // Permitir ver logs de usuarios ya eliminados (NULL)
            }]
        });

        return res.status(200).json({
            success: true,
            data: rows,
            pagination: {
                total: count,
                page,
                limit,
                totalPages: Math.ceil(count / limit)
            }
        });
    } catch (err) {
        next(err);
    }
};