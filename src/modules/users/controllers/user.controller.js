/**
 * CONTROLADOR: UserController
 * DESCRIPCIÓN: Puntos de entrada para la administración y consulta de identidades.
 */
const userService = require("../services/user.service");

/**
 * Recupera los territorios (municipios) y privilegios asignados al usuario autenticado.
 */
exports.getMyTerritories = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const territories = await userService.getUserAccessTerritories(userId);
        return res.status(200).json({
            success: true,
            message: "Configuración territorial recuperada.",
            data: territories
        });
    } catch (err) {
        return next(err);
    }
};

exports.getUsers = async (req, res, next) => {
    try {
        const result = await userService.getAllUsers(req.query);
        return res.status(200).json({
            success: true,
            data: result.rows,
            pagination: {
                total: result.count,
                page: result.page,
                limit: result.limit,
                totalPages: result.totalPages
            }
        });
    } catch (err) { return next(err); }
};

exports.getUserById = async (req, res, next) => {
    try {
        const user = await userService.getUserById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "Usuario no localizado." });
        return res.status(200).json({ success: true, data: user });
    } catch (err) { return next(err); }
};

exports.createUser = async (req, res, next) => {
    try {
        const adminId = req.user ? req.user.id : null; 
        const user = await userService.createUser(req.body, adminId);
        return res.status(201).json({ 
            success: true, 
            message: "Usuario registrado y matriz propagada.", 
            data: user 
        });
    } catch (err) { return next(err); }
};

exports.updateUser = async (req, res, next) => {
    try {
        const adminId = req.user ? req.user.id : null;
        const user = await userService.updateUser(req.params.id, req.body, adminId);
        return res.status(200).json({ 
            success: true, 
            message: "Actualización procesada exitosamente.", 
            data: user 
        });
    } catch (err) { return next(err); }
};

exports.updateUserPermission = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { municipioId, permissionId, value } = req.body; 
        await userService.updateSinglePermission(userId, municipioId, permissionId, value);
        return res.status(200).json({
            success: true,
            message: "Excepción de seguridad aplicada correctamente."
        });
    } catch (err) { return next(err); }
};

exports.deleteUser = async (req, res, next) => {
    try {
        await userService.deleteUser(req.params.id);
        return res.status(200).json({ success: true, message: "Registro eliminado." });
    } catch (err) { return next(err); }
};