/**
 * MODELO: Municipio
 * DESCRIPCIÓN: Representación de la entidad geográfica/administrativa para la segregación de expedientes.
 */
const { DataTypes } = require("sequelize");
const sequelize = require("../../../config/db");

const Municipio = sequelize.define("Municipio", {
    id: { 
        type: DataTypes.INTEGER, 
        primaryKey: true, 
        autoIncrement: true 
    },
    num: {// Número identificador oficial del municipio
        type: DataTypes.INTEGER, 
        unique: true
    },
    nombre: { 
        type: DataTypes.STRING(150), 
        allowNull: false 
    },
    active: { 
        type: DataTypes.BOOLEAN, 
        defaultValue: true
    }
}, {
    tableName: "municipios",
    schema: "public",
    timestamps: false,
    underscored: true,
});

module.exports = Municipio;