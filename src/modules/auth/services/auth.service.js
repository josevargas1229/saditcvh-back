// src/modules/auth/services/auth.service.js
const User = require("../../users/models/user.model");
const bcrypt = require("bcryptjs");
const jwtConfig = require("../../../config/jwt");
const { unauthorized } = require("../../../utils/errorResponse");
const Role = require("../../roles/models/roles.model");

const ACCESS_TOKEN_EXPIRATION = process.env.ACCESS_TOKEN_EXPIRATION || "15m"; // 15 minutos
const REFRESH_TOKEN_EXPIRATION = process.env.REFRESH_TOKEN_EXPIRATION || "7d";  // 7 días

/**
 * Busca al usuario por username y verifica la contraseña.
 * Genera Access Token y Refresh Token.
 * @param {string} username // <-- CAMBIADO DE email A username
 * @param {string} password
 * @returns {object} { user, accessToken, refreshToken }
 */
// src/modules/auth/services/auth.service.js
exports.authenticate = async (username, password) => {
    const user = await User.findOne({
        where: { 
            username,
            active: true // Impedir login si el usuario está desactivado por negocio
        },
        include: [{ 
            model: Role, 
            as: 'roles',
            where: { active: true }, // Solo roles vigentes
            required: false 
        }],
    });

    // Si el usuario no existe o está borrado lógicamente, user será null
    if (!user) {
        throw unauthorized("Credenciales inválidas o cuenta desactivada.");
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
        throw unauthorized("Credenciales inválidas.");
    }

    const roles = user.roles ? user.roles.map(role => role.name) : [];

    const payload = {
        id: user.id,
        username: user.username,
        roles,
    };

    return {
        user: {
            id: user.id,
            username: user.username,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            roles,
        },
        accessToken: jwtConfig.sign(payload, ACCESS_TOKEN_EXPIRATION),
        refreshToken: jwtConfig.sign(payload, REFRESH_TOKEN_EXPIRATION)
    };
};