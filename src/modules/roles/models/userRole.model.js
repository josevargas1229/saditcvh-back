const { DataTypes } = require("sequelize");
const sequelize = require("../../../config/db");

const UserRole = sequelize.define("UserRole", {
    id: { 
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },

    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: "users",
            key: "id"
        }
    },

    role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: "roles",
            key: "id"
        }
    }

}, {
    tableName: "user_roles",
    schema: "public",
    timestamps: true,
    paranoid: true,
    underscored: true,
});

module.exports = UserRole;
