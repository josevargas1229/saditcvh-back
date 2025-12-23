const { DataTypes } = require("sequelize");
const sequelize = require("../../../config/db");

const Municipio = sequelize.define("Municipio", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    num: { type: DataTypes.INTEGER, unique: true },
    nombre: { type: DataTypes.STRING, allowNull: false }
}, {
    tableName: "municipios",
    schema: "public",
    timestamps: false,
    underscored: true,
});

module.exports = Municipio;