const auditService = require("../services/audit.service");

exports.getLogs = async (req, res, next) => {
    try {
        const result = await auditService.getAuditLogs(req.query);
        const rows = result.rows;
        
        let nextCursor = null;
        if (rows.length > 0) {
            nextCursor = rows[rows.length - 1].id;
        }

        return res.status(200).json({
            success: true,
            data: rows,
            pagination: {
                total: result.count,
                nextCursor: nextCursor,
                limit: parseInt(req.query.limit) || 20
            }
        });
    } catch (err) {
        next(err);
    }
};

exports.getLogById = async (req, res, next) => {
    try {
        const log = await auditService.getAuditLogById(req.params.id);
        if (!log) {
            return res.status(404).json({ success: false, message: "Registro no encontrado" });
        }
        return res.status(200).json({ success: true, data: log });
    } catch (err) {
        next(err);
    }
};
