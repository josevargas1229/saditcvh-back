/**
 * MODELO: Permission
 * DESCRIPCIÓN: Define las acciones atómicas permitidas en el sistema (RBAC).
 * Representa privilegios como 'ver', 'descargar', 'editar', etc.
 */
const { DataTypes } = require("sequelize");
const sequelize = require("../../../config/db");
const { handleModelAudit } = require("../../audit/utils/auditHelper");

const Permission = sequelize.define("Permission", {
    id: { 
        type: DataTypes.INTEGER, 
        primaryKey: true, 
        autoIncrement: true 
    },
    name: { 
        type: DataTypes.STRING, 
        allowNull: false, 
        unique: true // 'ver', 'descargar', 'editar', 'eliminar', 'imprimir'
    },
    description: { 
        type: DataTypes.STRING, 
        allowNull: true
    },
    active: { 
        type: DataTypes.BOOLEAN,
        defaultValue: true 
    }
}, {
    tableName: "permissions",
    schema: "public",
    timestamps: true,
    paranoid: true,
    underscored: true,
    hooks: {
        afterCreate: (instance, options) => handleModelAudit(instance, options, 'CREATE'),
        afterUpdate: (instance, options) => handleModelAudit(instance, options, 'UPDATE'),
        afterDestroy: (instance, options) => handleModelAudit(instance, options, 'DELETE')
    }
});

module.exports = Permission;