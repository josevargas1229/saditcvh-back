const { DataTypes } = require("sequelize");
const sequelize = require("../../../config/db");

const Role = sequelize.define("Role", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    active: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
    tableName: "roles",
    schema: "public",
    timestamps: true, 
    paranoid: true,
    underscored: true,
});

module.exports = Role;
