const { Role, User } = require("../../../database/associations");


exports.getAllRoles = async () => {
    return await Role.findAll({
        order: [['id', 'ASC']]
    });
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