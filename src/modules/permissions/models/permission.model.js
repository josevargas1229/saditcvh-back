const { DataTypes } = require("sequelize");
const sequelize = require("../../../config/db");

const Permission = sequelize.define("Permission", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { 
        type: DataTypes.STRING, 
        allowNull: false, 
        unique: true // 'ver', 'descargar', 'editar', 'eliminar', 'imprimir'
    },
    description: { type: DataTypes.STRING, allowNull: true }
}, {
    tableName: "permissions",
    schema: "public",
    timestamps: false,
    underscored: true,
});

module.exports = Permission;