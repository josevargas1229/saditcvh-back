const { DataTypes } = require("sequelize");
const sequelize = require("../../../config/db");
const bcrypt = require("bcryptjs");
const { handleModelAudit } = require("../../audit/utils/auditHelper");

const User = sequelize.define("User", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    username: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true,
    },

    first_name: {
        type: DataTypes.STRING,
        allowNull: false,
    },

    last_name: {
        type: DataTypes.STRING,
        allowNull: false,
    },

    second_last_name: {
        type: DataTypes.STRING,
        allowNull: true,
    },

    email: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        validate: { isEmail: true }, 
    },

    password: {
        type: DataTypes.STRING,
        allowNull: false,
    },

    phone: {
        type: DataTypes.STRING,
        allowNull: true,
    },

    active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    },

    cargo_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },

    created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },

    updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },

}, {
    tableName: "users",
    schema: "public",
    underscored: true,
    timestamps: true,
    paranoid: true,
    hooks: {
        afterUpdate: (instance, options) => handleModelAudit(instance, options, 'UPDATE'),
        afterDestroy: (instance, options) => handleModelAudit(instance, options, 'DELETE')
    }
});

module.exports = User;