const { UserMunicipalityPermission, Permission } = require("../../../database/associations");

/**
 * Middleware para verificar permisos por municipio
 * @param {String} requiredPermissionName - Nombre del permiso (ver, editar, etc.)
 */
const checkPermission = (requiredPermissionName) => {
    return async (req, res, next) => {
        try {
            const userId = req.user.id; // Viene del middleware 'protect'
            const { municipioId } = req.body; // O req.params, dependiendo de tu ruta

            if (!municipioId) {
                return res.status(400).json({ 
                    success: false, 
                    message: "municipioId es requerido para validar permisos." 
                });
            }

            // Buscamos si el usuario tiene ese permiso específico en ese municipio
            const hasPermission = await UserMunicipalityPermission.findOne({
                where: {
                    user_id: userId,
                    municipio_id: municipioId
                },
                include: [{
                    model: Permission,
                    as: 'permission',
                    where: { name: requiredPermissionName }
                }]
            });

            if (!hasPermission) {
                return res.status(403).json({
                    success: false,
                    message: `No tienes permiso para '${requiredPermissionName}' en este municipio.`
                });
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};

module.exports = checkPermission;