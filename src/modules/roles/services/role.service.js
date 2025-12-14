const { Role, User, UserRole } = require("../../../database/associations"); 
const sequelize = require("../../../config/db");

exports.getAllRoles = async () => {
    return await Role.findAll({
        order: [['id', 'ASC']]
    });
};

exports.getRoleCounts = async () => {
    try {
        const counts = await Role.findAll({
            attributes: [
                'id',
                'name',
                [
                    // MODIFICACIÓN CLAVE: Usamos un JOIN dentro de la subconsulta
                    // para filtrar solo los usuarios que tienen deleted_at IS NULL.
                    sequelize.literal(`
                        (SELECT COUNT(ur.user_id) 
                         FROM user_roles AS ur
                         INNER JOIN users AS u ON u.id = ur.user_id
                         WHERE ur.role_id = "Role".id AND u.deleted_at IS NULL)
                    `),
                    'userCount' 
                ]
            ],
            
            // Requerido por PostgreSQL
            group: ['Role.id', 'Role.name'], 
            
            order: [['name', 'ASC']],
            
            // Usamos la subconsulta literal para el filtro HAVING también
            having: sequelize.literal(`
                (SELECT COUNT(ur.user_id) 
                 FROM user_roles AS ur
                 INNER JOIN users AS u ON u.id = ur.user_id
                 WHERE ur.role_id = "Role".id AND u.deleted_at IS NULL) > 0
            `),
        });

        // Mapear el resultado al formato limpio que espera el frontend
        return counts.map(role => ({
            roleId: role.id,
            roleName: role.name,
            count: parseInt(role.getDataValue('userCount'), 10)
        }));

    } catch (error) {
        console.error("Error al obtener conteos de roles:", error);
        throw error;
    }
};

exports.createRole = async (data) => {

    const existingRole = await Role.findOne({ where: { name: data.name } });
    if (existingRole) {
        throw new Error("El rol ya existe");
    }
    return await Role.create(data);
};


exports.updateRole = async (id, data) => {
    const role = await Role.findByPk(id);
    if (!role) throw new Error("Rol no encontrado");
    return await role.update(data);
};


exports.deleteRole = async (id) => {
    const role = await Role.findByPk(id);
    if (!role) throw new Error("Rol no encontrado");
    return await role.destroy();
};


exports.getRolesByUserId = async (userId) => {
    const user = await User.findByPk(userId, {
        include: [{ 
            model: Role, 
            as: 'roles' 
        }],
    });

    if (!user) {
        return [];
    }
    return user.roles ? user.roles.map(role => role.name) : [];
};