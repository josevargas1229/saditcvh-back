const permissionService = require("../services/permission.service");

exports.getPermissions = async (req, res, next) => {
    try {
        const permissions = await permissionService.getAllPermissions();
        return res.status(200).json({ 
            success: true, 
            message: "Catálogo de permisos obtenido", 
            data: permissions 
        });
    } catch (err) { 
        return next(err); 
    }
};