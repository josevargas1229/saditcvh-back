const { DataTypes } = require("sequelize");
const sequelize = require("../../../config/db");

const UserMunicipalityPermission = sequelize.define("UserMunicipalityPermission", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" }
    },
    municipio_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "municipios", key: "id" }
    },
    permission_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "permissions", key: "id" }
    },
    is_exception: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: "user_municipality_permissions",
    schema: "public",
    timestamps: true,
    underscored: true,
    paranoid: true
});

module.exports = UserMunicipalityPermission;