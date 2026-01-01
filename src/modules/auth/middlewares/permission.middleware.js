const { UserMunicipalityPermission, Permission, Municipio, User, Role } = require("../../../database/associations");

/**
 * Verifica privilegios granulares validando el Rol y la Matriz Territorial.
 */
const checkPermission = (requiredPermissionName) => {
    return async (req, res, next) => {
        try {
            const userId = req.user.id;
            const municipioId = req.body.municipioId || req.params.municipioId || req.query.municipioId;

            // 1. EL "CORTA-CIRCUITO" PARA ADMINISTRADORES
            // Buscamos si el usuario tiene el rol de administrador (ID 1)
            const user = await User.findByPk(userId, {
                include: [{ 
                    model: Role, 
                    as: 'roles', 
                    where: { id: 1 }, 
                    required: false 
                }]
            });

            const isAdmin = user.roles && user.roles.length > 0;

            // Si es administrador, tiene permiso para TODO automáticamente
            if (isAdmin) {
                return next();
            }

            // 2. PROTECCIÓN CRÍTICA: Solo administradores pueden eliminar
            // Si la acción es 'eliminar' y llegamos aquí, es que NO es admin.
            if (requiredPermissionName === 'eliminar') {
                return res.status(403).json({
                    success: false,
                    message: "Acceso denegado: Solo el personal administrativo puede eliminar registros permanentes."
                });
            }

            // 3. VALIDACIÓN DE MUNICIPIO PARA MORTALES
            if (!municipioId) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Identificador de municipio no proporcionado para validar privilegios territoriales." 
                });
            }

            // 4. CONSULTA A LA MATRIZ FISICA (Solo para Operadores/Consulta)
            const permissionRegistry = await UserMunicipalityPermission.findOne({
                where: {
                    user_id: userId,
                    municipio_id: municipioId,
                    active: true 
                },
                include: [
                    {
                        model: Permission,
                        as: 'permission',
                        where: { 
                            name: requiredPermissionName,
                            active: true 
                        }
                    },
                    {
                        model: Municipio,
                        as: 'municipio',
                        where: { active: true }
                    }
                ]
            });

            if (!permissionRegistry) {
                return res.status(403).json({
                    success: false,
                    message: `Acceso denegado: No cuenta con el permiso de '${requiredPermissionName}' asignado para este municipio.`
                });
            }

            return next();
        } catch (error) {
            return next(error);
        }
    };
};

module.exports = checkPermission;