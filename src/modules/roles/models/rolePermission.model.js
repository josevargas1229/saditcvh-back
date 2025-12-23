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
    schema: "public",
    timestamps: false,
    underscored: true,
});

module.exports = RolePermission;