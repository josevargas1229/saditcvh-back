const auditService = require("../services/audit.service");

exports.getLogs = async (req, res, next) => {
    try {
        const result = await auditService.getAuditLogs(req.query);
        
        return res.status(200).json({
            success: true,
            data: result.rows,
            pagination: {
                total: result.count,
                page: parseInt(req.query.page) || 1,
                limit: parseInt(req.query.limit) || 20,
                totalPages: Math.ceil(result.count / (parseInt(req.query.limit) || 20))
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