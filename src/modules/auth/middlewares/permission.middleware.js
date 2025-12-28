/**
 * ARCHIVO: permission.middleware.js
 * DESCRIPCIÓN: Middleware de validación de privilegios granulares.
 * Implementa una lógica de control de acceso basada en la relación Usuario-Municipio-Permiso.
 */

const { UserMunicipalityPermission, Permission, Municipio } = require("../../../database/associations");

/**
 * Verifica privilegios granulares validando que la relación, 
 * el permiso y el municipio estén activos y no borrados.
 */
const checkPermission = (requiredPermissionName) => {
    return async (req, res, next) => {
        try {
            const userId = req.user.id;
            const municipioId = req.body.municipioId || req.params.municipioId || req.query.municipioId;

            if (!municipioId) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Identificador de municipio no proporcionado." 
                });
            }

            /**
             * Consulta de verificación en la tabla maestra de permisos granulares.
             * Se valida la existencia del registro que vincula al usuario con el municipio
             * y el permiso específico requerido.
             */
            const permissionRegistry = await UserMunicipalityPermission.findOne({
                where: {
                    user_id: userId,
                    municipio_id: municipioId,
                    active: true // Debe estar marcado como activo
                },
                include: [
                    {
                        model: Permission,
                        as: 'permission',
                        where: { 
                            name: requiredPermissionName,
                            active: true // El permiso base debe estar activo
                        }
                    },
                    {
                        model: Municipio,
                        as: 'municipio',
                        where: { active: true } // El municipio debe estar vigente
                    }
                ]
            });

            if (!permissionRegistry) {
                return res.status(403).json({
                    success: false,
                    message: `Acceso denegado: Privilegios insuficientes para la acción '${requiredPermissionName}' en esta entidad.`
                });
            }

            return next();
        } catch (error) {
            return next(error);
        }
    };
};

module.exports = checkPermission;