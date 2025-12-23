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
        defaultValue: false,
        //Si es true, este permiso fue editado manualmente y no depende del rol
    }
}, {
    tableName: "user_municipality_permissions",
    schema: "public",
    timestamps: true, // Útil para saber cuándo se dio el permiso
    underscored: true,
});

module.exports = UserMunicipalityPermission;