const { DataTypes } = require("sequelize");
const sequelize = require("../../../config/db");

const Cargo = sequelize.define("Cargo", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.STRING, allowNull: false },
}, {
    tableName: "cargos",
    timestamps: false,
});

module.exports = Cargo;
