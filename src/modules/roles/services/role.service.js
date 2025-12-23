const { Role, User, Permission, RolePermission } = require("../../../database/associations"); 
const sequelize = require("../../../config/db");

exports.getAllRoles = async () => {
    return await Role.findAll({
        include: [{
            model: Permission,
            as: 'base_permissions',
            attributes: { exclude: ["description"] },
            through: { attributes: [] } // No traer datos de la tabla intermedia
        }],
        order: [['id', 'ASC']]
    });
};

exports.getRoleCounts = async () => {
    try {
        const counts = await Role.findAll({
            attributes: [
                'id', 'name',
                [
                    sequelize.literal(`
                        (SELECT COUNT(ur.user_id) 
                         FROM user_roles AS ur
                         INNER JOIN users AS u ON u.id = ur.user_id
                         WHERE ur.role_id = "Role".id AND u.deleted_at IS NULL)
                    `),
                    'userCount' 
                ]
            ],
            group: ['Role.id', 'Role.name'], 
            order: [['name', 'ASC']],
            having: sequelize.literal(`
                (SELECT COUNT(ur.user_id) 
                 FROM user_roles AS ur
                 INNER JOIN users AS u ON u.id = ur.user_id
                 WHERE ur.role_id = "Role".id AND u.deleted_at IS NULL) > 0
            `),
        });

        return counts.map(role => ({
            roleId: role.id,
            roleName: role.name,
            count: parseInt(role.getDataValue('userCount'), 10)
        }));
    } catch (error) {
        throw error;
    }
};

/**
 * Crea un rol y le asigna sus permisos base
 * @param {Object} data { name: 'Consultor', permissions: [1, 2, 3] }
 */
exports.createRole = async (data) => {
    const transaction = await sequelize.transaction();
    try {
        const existingRole = await Role.findOne({ where: { name: data.name } });
        if (existingRole) throw new Error("El rol ya existe");

        const role = await Role.create({ name: data.name }, { transaction });

        if (data.permissions && data.permissions.length > 0) {
            const rolePerms = data.permissions.map(pId => ({
                role_id: role.id,
                permission_id: pId
            }));
            await RolePermission.bulkCreate(rolePerms, { transaction });
        }

        await transaction.commit();
        return role;
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

exports.updateRole = async (id, data) => {
    const transaction = await sequelize.transaction();
    try {
        const role = await Role.findByPk(id);
        if (!role) throw new Error("Rol no encontrado");

        await role.update({ name: data.name }, { transaction });

        // Si se envían permisos, actualizamos la tabla intermedia
        if (data.permissions) {
            // Borrar permisos actuales
            await RolePermission.destroy({ where: { role_id: id }, transaction });
            
            // Insertar los nuevos
            if (data.permissions.length > 0) {
                const rolePerms = data.permissions.map(pId => ({
                    role_id: id,
                    permission_id: pId
                }));
                await RolePermission.bulkCreate(rolePerms, { transaction });
            }
        }

        await transaction.commit();
        return role;
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
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
            as: 'roles',
            include: [{ model: Permission, as: 'base_permissions' }]
        }],
    });
    return user ? user.roles : [];
};