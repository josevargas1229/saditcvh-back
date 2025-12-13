const User = require("../modules/users/models/user.model");
const Role = require("../modules/roles/models/roles.model");
const Cargo = require("../modules/cargo/models/cargo.model");
const UserRole = require("../modules/roles/models/userRole.model");

User.belongsToMany(Role, { through: UserRole, foreignKey: 'user_id', otherKey: 'role_id', as: 'roles' });
Role.belongsToMany(User, { through: UserRole, foreignKey: 'role_id', optherKey: 'user_id', as: 'users'});

User.belongsTo(Cargo, { foreignKey: 'cargo_id', as: 'cargo' });
Cargo.hasMany(User, { foreignKey: 'cargo_id', as: 'users' });


User.belongsTo(User, {as: 'creator', foreignKey: 'created_by'});
User.belongsTo(User, {as: 'editor', foreignKey: 'updated_by'});


module.exports = {
    User,
    Role,
    Cargo,
    UserRole
};
