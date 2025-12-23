const roleService = require("../services/role.service");

exports.getRoles = async (req, res, next) => {
    try {
        const roles = await roleService.getAllRoles();
        res.status(200).json({ 
            success: true, 
            message: "Lista de roles con sus permisos base obtenida", 
            data: roles 
        });
    } catch (err) { next(err); }
};

exports.getRoleCounts = async (req, res, next) => {
    try {
        const counts = await roleService.getRoleCounts();
        res.status(200).json({
            success: true,
            message: "Conteo de usuarios por rol obtenido",
            data: counts
        });
    } catch (err) { next(err); }
};

exports.createRole = async (req, res, next) => {
    try {
        // req.body ahora puede traer { name: "Editor", permissions: [1, 3, 4] }
        const role = await roleService.createRole(req.body);
        res.status(201).json({ 
            success: true, 
            message: "Rol y permisos base configurados", 
            data: role 
        });
    } catch (err) { next(err); }
};

exports.updateRole = async (req, res, next) => {
    try {
        const role = await roleService.updateRole(req.params.id, req.body);
        res.status(200).json({ 
            success: true, 
            message: "Rol actualizado exitosamente", 
            data: role 
        });
    } catch (err) { next(err); }
};

exports.deleteRole = async (req, res, next) => {
    try {
        await roleService.deleteRole(req.params.id);
        res.status(200).json({ 
            success: true, 
            message: "Rol eliminado correctamente",
            data: null
        });
    } catch (err) { next(err); }
};