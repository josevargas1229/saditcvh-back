/**
 * MODELO: AuditLog
 * DESCRIPCIÓN: Registro de trazabilidad para cumplimiento normativo y transparencia.
 */
const { DataTypes } = require("sequelize");
const sequelize = require("../../../config/db");

const AuditLog = sequelize.define("AuditLog", {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    action: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    module: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    entity_id: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true
    },
    user_agent: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    details: {
        type: DataTypes.JSONB,
        defaultValue: {}
    }
}, {
    tableName: "audit_logs",
    schema: "public",
    timestamps: true,
    updatedAt: false, // Inmutable: No se permite actualización
    createdAt: "created_at",
    underscored: true
});

module.exports = AuditLog;