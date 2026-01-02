/**
 * CONTROLADOR: UserController
 * DESCRIPCIÓN: Puntos de entrada para la administración y consulta de identidades.
 */
const userService = require("../services/user.service");
const sequelize = require("../../../config/db");

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
        const user = await userService.createUser(req.body, adminId, req);
        return res.status(201).json({ 
            success: true, 
            message: "Usuario registrado y matriz propagada.", 
            data: user 
        });
    } catch (err) { return next(err); }
};

/**
 * Actualiza usuario (Llama al servicio que contiene la lógica de permisos)
 */
exports.updateUser = async (req, res, next) => {
    try {
        // 1. Extraemos los datos de la petición (req)
        const { id } = req.params;     // El ID viene de la URL
        const data = req.body;         // Los datos (municipios, roles, nombre) vienen del Body
        const adminId = req.user ? req.user.id : null; // El admin viene del token

        // 2. Llamamos al servicio (Aquí es donde está la magia de transacciones que corregimos antes)
       const user = await userService.updateUser(id, data, adminId, req);
        
        // 3. Respondemos al cliente
        return res.status(200).json({ 
            success: true, 
            message: "Actualización procesada exitosamente.", 
            data: user 
        });
    } catch (err) { return next(err); }
};

exports.updatePermissionsBatch = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { changes } = req.body;

        if (!changes || !Array.isArray(changes)) {
            return res.status(400).json({ success: false, message: "Formato de datos incorrecto." });
        }

        await userService.updatePermissionsBatch(userId, changes, req);
        
        return res.status(200).json({
            success: true,
            message: "Matriz de permisos actualizada correctamente."
        });
    } catch (err) { return next(err); }
};


exports.getUserPermissionsRaw = async (req, res, next) => {
    try {
        const data = await userService.getUserPermissionsRaw(req.params.id);
        return res.status(200).json({ success: true, data });
    } catch (err) { return next(err); }
};


exports.updateUserPermission = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { municipioId, permissionId, value } = req.body; 

        // Validación básica
        if (!municipioId || !permissionId) {
            return res.status(400).json({ 
                success: false, 
                message: "Faltan datos obligatorios (municipioId o permissionId)." 
            });
        }

        await userService.updateSinglePermission(userId, municipioId, permissionId, value, req);
        
        return res.status(200).json({
            success: true,
            message: "Permiso actualizado correctamente."
        });
    } catch (err) { 
        return next(err); 
    }
};


exports.deleteUser = async (req, res, next) => {
    try {
        await userService.deleteUser(req.params.id, req);
        return res.status(200).json({ success: true, message: "Registro eliminado." });
    } catch (err) { return next(err); }
};