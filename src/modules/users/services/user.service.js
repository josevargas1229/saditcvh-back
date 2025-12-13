const { sequelize } = require("../../../config/db"); 
const { User, Role, Cargo } = require("../../../database/associations");
const bcrypt = require("bcryptjs");


exports.getAllUsers = async () => {
    return await User.findAll({
        attributes: { exclude: ["password", "deleted_at"] },
        include: [
            { 
                model: Cargo, 
                as: 'cargo',
                attributes: ['id', 'nombre'] 
            },
            { 
                model: Role, 
                as: 'roles',
                attributes: ['id', 'name'],
                through: { attributes: [] }
            }
        ],
        order: [['id', 'DESC']]
    });
};

exports.getUserById = async (id) => {
    return await User.findByPk(id, {
        attributes: { exclude: ["password"] },
        include: [
            { model: Cargo, as: 'cargo' },
            { model: Role, as: 'roles' }
        ]
    });
};

exports.createUser = async (data, adminId) => {
    const transaction = await sequelize.transaction();
    try {
        if (data.password) {
            data.password = await bcrypt.hash(data.password, 10);
        }
        // Crear usuario con auditoría
        const newUser = await User.create({
            ...data,
            created_by: adminId,
            updated_by: adminId
        }, { transaction });

        // Asignar Roles
        if (data.roles && data.roles.length > 0) {
            await newUser.setRoles(data.roles, { transaction });
        }

        await transaction.commit();
        return await exports.getUserById(newUser.id);

    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

exports.updateUser = async (id, data, adminId) => {
    const transaction = await sequelize.transaction();
    try {
        const user = await User.findByPk(id);
        if (!user) throw new Error("Usuario no encontrado");

        if (data.password) {
            data.password = await bcrypt.hash(data.password, 10);
        }

        // Actualizar datos
        await user.update({ ...data, updated_by: adminId }, { transaction });

        // Actualizar Roles
        if (data.roles) {
            await user.setRoles(data.roles, { transaction });
        }

        await transaction.commit();
        return await exports.getUserById(id);

    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

exports.deleteUser = async (id) => {
    const user = await User.findByPk(id);
    if (!user) throw new Error("Usuario no encontrado");
    return await user.destroy();
};