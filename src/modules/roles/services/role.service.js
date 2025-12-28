/**
 * SERVICIO: RoleService
 * DESCRIPCIÓN: Gestión de perfiles de usuario y matriz de privilegios base.
 */
const { Role, User, Permission, RolePermission } = require("../../../database/associations"); 
const sequelize = require("../../../config/db");

/**
 * Recupera todos los roles con su configuración de privilegios base.
 * @returns {Promise<Array>} Listado de roles y sus permisos asociados.
 */
exports.getAllRoles = async () => {
    return await Role.findAll({
        where: { active: true },
        include: [{
            model: Permission,
            as: 'base_permissions',
            where: { active: true },
            attributes: { exclude: ["description"] },
            through: { attributes: [] },
            required: false
        }],
        order: [['id', 'ASC']]
    });
};

/**
 * Genera estadísticas de ocupación por rol (Usuarios activos).
 * @returns {Promise<Array>} Objetos con métricas de uso por perfil.
 */
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
                         WHERE ur.role_id = "Role".id 
                         AND u.deleted_at IS NULL 
                         AND u.active = true)
                    `),
                    'userCount' 
                ]
            ],
            where: { active: true },
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
 * Crea un rol y vincula una colección de permisos atómicos.
 * @param {Object} data - Definición del rol y array de permission_ids.
 * @returns {Promise<Object>} Instancia del rol creado bajo transacción.
 */
exports.createRole = async (data, req) => {
    const transaction = await sequelize.transaction();
    try {
        const existingRole = await Role.findOne({ where: { name: data.name } });
        if (existingRole) throw new Error("Conflicto: El identificador de rol ya existe.");

        // Pasamos req y transaction
        const role = await Role.create({ name: data.name }, { transaction, req });

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

/**
 * Actualiza la denominación del rol y sincroniza su matriz de permisos.
 */
exports.updateRole = async (id, data, req) => {
    const transaction = await sequelize.transaction();
    try {
        const role = await Role.findByPk(id);
        if (!role) throw new Error("Registro no localizado.");

        // Pasamos req para que el Hook detecte si el nombre cambió
        await role.update({ name: data.name }, { transaction, req });

        if (data.permissions) {
            await RolePermission.destroy({ where: { role_id: id }, transaction });
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

/**
 * Elimina un rol del catálogo.
 */
exports.deleteRole = async (id, req) => {
    const role = await Role.findByPk(id);
    if (!role) throw new Error("Registro no localizado.");
    await role.update({ active: false }, { req }); 
    return await role.destroy({ req }); 
};