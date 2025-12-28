/**
 * CONTROLADOR: RoleController
 * DESCRIPCIÓN: Punto de entrada para la administración de perfiles y seguridad.
 */
const roleService = require("../services/role.service");

/**
 * Recupera el listado de roles con su configuración de seguridad.
 */
exports.getRoles = async (req, res, next) => {
    try {
        const roles = await roleService.getAllRoles();
        return res.status(200).json({ 
            success: true, 
            message: "Configuración de roles y privilegios base recuperada.", 
            data: roles 
        });
    } catch (err) { return next(err); }
};

/**
 * Obtiene métricas de distribución de usuarios por perfil.
 */
exports.getRoleCounts = async (req, res, next) => {
    try {
        const counts = await roleService.getRoleCounts();
        return res.status(200).json({
            success: true,
            message: "Estadísticas de distribución de perfiles generadas.",
            data: counts
        });
    } catch (err) { return next(err); }
};

/**
 * Registra un nuevo rol con privilegios predefinidos.
 */
exports.createRole = async (req, res, next) => {
    try {
        const role = await roleService.createRole(req.body, req);
        return res.status(201).json({ 
            success: true, 
            message: "Entidad de rol y matriz de privilegios creada.", 
            data: role 
        });
    } catch (err) { return next(err); }
};

/**
 * Actualiza la información y permisos de un rol existente.
 */
exports.updateRole = async (req, res, next) => {
    try {
        const role = await roleService.updateRole(req.params.id, req.body, req);
        return res.status(200).json({ 
            success: true, 
            message: "Actualización de rol y privilegios procesada exitosamente.", 
            data: role 
        });
    } catch (err) { return next(err); }
};

/**
 * Elimina un perfil de la base de datos.
 */
exports.deleteRole = async (req, res, next) => {
    try {
        await roleService.deleteRole(req.params.id, req);
        return res.status(200).json({ 
            success: true, 
            message: "Registro de rol eliminado del sistema.",
            data: null
        });
    } catch (err) { return next(err); }
};