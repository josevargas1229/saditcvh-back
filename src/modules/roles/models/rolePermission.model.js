/**
 * MODELO: RolePermission (Tabla Intermedia)
 * DESCRIPCIÓN: Gestiona la asociación jerárquica entre Roles y Permisos.
 * Define la plantilla de privilegios base que heredarán los usuarios de un rol.
 */
const { DataTypes } = require("sequelize");
const sequelize = require("../../../config/db");

const RolePermission = sequelize.define("RolePermission", {
    role_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        references: { model: "roles", key: "id" }
    },
    permission_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        references: { model: "permissions", key: "id" }
    }
}, {
    tableName: "role_permissions",
    timestamps: true,
    paranoid: true,
    underscored: true
});

module.exports = RolePermission;