const { DataTypes } = require("sequelize");
const sequelize = require("../../../config/db");
const { handleModelAudit } = require("../../audit/utils/auditHelper");

const Cargo = sequelize.define("Cargo", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.STRING, allowNull: false },
}, {
    tableName: "cargos",
    timestamps: false,
    hooks: {
        afterCreate: (instance, options) => handleModelAudit(instance, options, 'CREATE'),
        afterUpdate: (instance, options) => handleModelAudit(instance, options, 'UPDATE'),
        // No tiene paranoid, así que 'DELETE' será físico pero quedará en bitácora
        afterDestroy: (instance, options) => handleModelAudit(instance, options, 'DELETE')
    }
});

module.exports = Cargo;
