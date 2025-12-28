const User = require("../modules/users/models/user.model");
const Role = require("../modules/roles/models/roles.model");
const Cargo = require("../modules/cargo/models/cargo.model");
const UserRole = require("../modules/roles/models/userRole.model");
const Permission = require("../modules/permissions/models/permission.model");
const RolePermission = require("../modules/roles/models/rolePermission.model");
const Municipio = require("../modules/municipios/models/municipio.model");
const UserMunicipalityPermission = require("../modules/users/models/userMunicipalityPermission.model");
const AuditLog = require("../modules/audit/models/auditLog.model");

User.belongsToMany(Role, { through: UserRole, foreignKey: 'user_id', otherKey: 'role_id', as: 'roles' });
Role.belongsToMany(User, { through: UserRole, foreignKey: 'role_id', otherKey: 'user_id', as: 'users' });

User.belongsTo(Cargo, { foreignKey: 'cargo_id', as: 'cargo' });
Cargo.hasMany(User, { foreignKey: 'cargo_id', as: 'users' });

User.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });
User.belongsTo(User, { as: 'editor', foreignKey: 'updated_by' });

User.hasMany(User, { as: 'createdUsers', foreignKey: 'created_by' });
User.hasMany(User, { as: 'updatedUsers', foreignKey: 'updated_by' });

// Un usuario puede tener muchos logs
User.hasMany(AuditLog, { foreignKey: 'user_id', as: 'audit_logs' });
AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Roles y sus Permisos Base (La "plantilla" por defecto)
Role.belongsToMany(Permission, { 
    through: RolePermission, 
    foreignKey: 'role_id', 
    otherKey: 'permission_id', 
    as: 'base_permissions' 
});
Permission.belongsToMany(Role, { 
    through: RolePermission, 
    foreignKey: 'permission_id', 
    otherKey: 'role_id' 
});

// Usuarios y su Matriz de Acceso por Municipio
// Esta relación permite hacer: user.getMunicipalityAccess()
User.hasMany(UserMunicipalityPermission, { foreignKey: 'user_id', as: 'municipality_access' });
UserMunicipalityPermission.belongsTo(User, { foreignKey: 'user_id' });

// Conexión con Municipios
UserMunicipalityPermission.belongsTo(Municipio, { foreignKey: 'municipio_id', as: 'municipio' });
Municipio.hasMany(UserMunicipalityPermission, { foreignKey: 'municipio_id' });

// Conexión con Permisos
UserMunicipalityPermission.belongsTo(Permission, { foreignKey: 'permission_id', as: 'permission' });
Permission.hasMany(UserMunicipalityPermission, { foreignKey: 'permission_id' });

module.exports = {
    User,
    Role,
    Cargo,
    UserRole,
    Permission,
    RolePermission,
    Municipio,
    UserMunicipalityPermission,
    AuditLog,
};