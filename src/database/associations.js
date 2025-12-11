const User = require("../modules/users/models/user.model");
const Role = require("../modules/roles/models/roles.model");
const Cargo = require("../modules/cargo/models/cargo.model");
const UserRole = require("../modules/roles/models/userRole.model");

User.belongsToMany(Role, { through: UserRole, foreignKey: 'user_id' });
Role.belongsToMany(User, { through: UserRole, foreignKey: 'role_id' });

User.belongsTo(Cargo, { foreignKey: 'cargo_id' });
Cargo.hasMany(User, { foreignKey: 'cargo_id' });

module.exports = {
    User,
    Role,
    Cargo
};
