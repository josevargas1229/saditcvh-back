const userService = require("../services/user.service");

exports.getUsers = async (req, res, next) => {
    try {
        const result = await userService.getAllUsers(req.query);

        res.status(200).json({
            success: true,
            data: result.rows,
            pagination: {
                total: result.count,
                page: result.page,
                limit: result.limit,
                totalPages: result.totalPages
            }
        });
    } catch (err) {
        next(err);
    }
};

exports.getUserById = async (req, res, next) => {
    try {
        const user = await userService.getUserById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "Usuario no encontrado" });
        res.status(200).json({ success: true, data: user });
    } catch (err) { next(err); }
};

exports.createUser = async (req, res, next) => {
    try {
        
        const adminId = req.user ? req.user.id : null; 
        const user = await userService.createUser(req.body, adminId);
        
        res.status(201).json({ 
            success: true, 
            message: "Usuario creado correctamente", 
            data: user 
        });
    } catch (err) { next(err); }
};

exports.updateUser = async (req, res, next) => {
    try {
        const adminId = req.user ? req.user.id : null;
        const user = await userService.updateUser(req.params.id, req.body, adminId);
        
        res.status(200).json({ 
            success: true, 
            message: "Usuario actualizado correctamente", 
            data: user 
        });
    } catch (err) { next(err); }
};

exports.updateUserPermission = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { municipioId, permissionId, value } = req.body; 
        // value es un booleano: true para otorgar, false para quitar

        await userService.updateSinglePermission(userId, municipioId, permissionId, value);
        
        res.status(200).json({
            success: true,
            message: "Permiso actualizado correctamente (Excepción aplicada)"
        });
    } catch (err) {
        next(err);
    }
};

exports.deleteUser = async (req, res, next) => {
    try {
        await userService.deleteUser(req.params.id);
        res.status(200).json({ success: true, message: "Usuario eliminado correctamente" });
    } catch (err) { next(err); }
};