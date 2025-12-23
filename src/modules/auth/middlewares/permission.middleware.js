/**
 * ARCHIVO: permission.middleware.js
 * DESCRIPCIÓN: Middleware de validación de privilegios granulares.
 * Implementa una lógica de control de acceso basada en la relación Usuario-Municipio-Permiso.
 */

const { UserMunicipalityPermission, Permission } = require("../../../database/associations");

/**
 * Verifica si el usuario autenticado posee los privilegios necesarios para ejecutar 
 * una acción sobre un municipio específico.
 * * @param {string} requiredPermissionName - Identificador de la acción (ver, editar, eliminar, etc.).
 * @returns {Function}
 */
const checkPermission = (requiredPermissionName) => {
    return async (req, res, next) => {
        try {
            const userId = req.user.id;
            
            // Extracción del identificador de entidad desde el cuerpo o parámetros de la petición.
            const municipioId = req.body.municipioId || req.params.municipioId || req.query.municipioId;

            if (!municipioId) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Identificador de municipio (municipioId) no proporcionado." 
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
                    municipio_id: municipioId
                },
                include: [{
                    model: Permission,
                    as: 'permission',
                    where: { name: requiredPermissionName }
                }]
            });

            // En caso de no existir una relación explícita, se deniega el acceso (Principio de Menor Privilegio).
            if (!permissionRegistry) {
                return res.status(403).json({
                    success: false,
                    message: `Acceso denegado: Privilegios insuficientes para la acción '${requiredPermissionName}' en esta entidad.`
                });
            }

            return next();
        } catch (error) {
            // Propagación del error al manejador global de excepciones.
            return next(error);
        }
    };
};

module.exports = checkPermission;