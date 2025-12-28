const authService = require("../services/auth.service");
const auditService = require("../../audit/services/audit.service"); // Importar auditoría
const { badRequest, unauthorized } = require("../../../utils/errorResponse");
const { User, Role } = require("../../../database/associations");
const jwtConfig = require("../../../config/jwt");

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * CONSTANTES DE TIEMPO
 */
const ACCESS_TOKEN_EXPIRATION = 1000 * 60 * 15; // 15 Minutos
const REFRESH_TOKEN_EXPIRATION = 1000 * 60 * 60 * 24 * 7; // 7 Días

/**
 * Configuración de las cookies
 */
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "strict",
    path: "/", 
};

/**
 * LOGIN
 */
exports.login = async (req, res, next) => {
    try {
        const { username, password } = req.body;

        const { user, accessToken, refreshToken } = await authService.authenticate(
            username,
            password
        );

        req.user = user

        // REGISTRO EN BITÁCORA: Login Exitoso
       // Ahora pasamos el req real, completo con sus headers y métodos
        await auditService.createLog(req, { 
            action: 'LOGIN',
            module: 'AUTH',
            entityId: user.id,
            details: { status: 'success', method: 'password' }
        });

        // 1. Access Token
        res.cookie("accessToken", accessToken, {
            ...COOKIE_OPTIONS,
            maxAge: ACCESS_TOKEN_EXPIRATION,
        });

        // 2. Refresh Token
        res.cookie("refreshToken", refreshToken, {
            ...COOKIE_OPTIONS,
            maxAge: REFRESH_TOKEN_EXPIRATION,
        });

        res.json({
            success: true,
            message: "Login exitoso",
            user: user, 
        });
    } catch (err) {
        // REGISTRO EN BITÁCORA: Intento fallido
        // Como no hay req.user, el servicio guardará "Sistema/Anónimo" por defecto
        await auditService.createLog(req, {
            action: 'LOGIN_ATTEMPT',
            module: 'AUTH',
            details: { status: 'failed', username: req.body.username, reason: err.message }
        });
        next(err);
    }
};

/**
 * LOGOUT
 */
exports.logout = async (req, res, next) => {
    try {
        // 1. Registrar primero (mientras req.user existe gracias al middleware protect)
        if (req.user) {
            await auditService.createLog(req, {
                action: 'LOGOUT',
                module: 'AUTH',
                entityId: req.user.id,
                details: { status: 'success' }
            });
        }

        // 2. Luego limpiar cookies
        res.clearCookie("accessToken", COOKIE_OPTIONS);
        res.clearCookie("refreshToken", COOKIE_OPTIONS);

        return res.json({
            success: true,
            message: "Sesión cerrada correctamente",
        });
    } catch (err) {
        next(err);
    }
};

/**
 * CHECK STATUS
 */
exports.checkStatus = async (req, res, next) => {
    try {
        const token = req.cookies.accessToken;

        if (!token) {
            return res.status(200).json({ authenticated: false });
        }

        const payload = jwtConfig.verify(token);


        const user = await User.findByPk(payload.id, {
            include: [{ model: Role, as: 'roles' }],
        });

        if (!user || user.active === false) {
            res.clearCookie("accessToken", COOKIE_OPTIONS);
            res.clearCookie("refreshToken", COOKIE_OPTIONS);
            return res.status(200).json({ authenticated: false });
        }


        const roles = user.roles ? user.roles.map(r => r.name) : [];

        const userData = {
            id: user.id,
            username: user.username,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            roles,
        };

        return res.json({
            authenticated: true,
            user: userData,
        });
    } catch (err) {
        res.clearCookie("accessToken", COOKIE_OPTIONS);
        return res.status(200).json({ authenticated: false });
    }
};

/**
 * REFRESH TOKEN
 */
exports.refreshToken = async (req, res, next) => {
    try {
        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken) {
            // Usamos unauthorized importado arriba
            throw unauthorized("No hay token de refresco");
        }

        let payload;
        try {
            payload = jwtConfig.verify(refreshToken);
        } catch (e) {
            throw unauthorized("Token de refresco inválido");
        }

        const user = await User.findByPk(payload.id, {
            include: [{ model: Role, as: 'roles' }],
        });

        if (!user || user.active === false) {
            res.clearCookie("accessToken", COOKIE_OPTIONS);
            res.clearCookie("refreshToken", COOKIE_OPTIONS);
            throw unauthorized("Usuario no válido");
        }

        const roles = user.roles ? user.roles.map(r => r.name) : [];

        const newPayload = {
            id: user.id,
            username: user.username,
            roles,
        };

        // Definimos '15m' o usamos ms
        const newAccessToken = jwtConfig.sign(newPayload, '15m'); 

        res.cookie("accessToken", newAccessToken, {
            ...COOKIE_OPTIONS,
            maxAge: ACCESS_TOKEN_EXPIRATION,
        });

        const userData = {
            id: user.id,
            username: user.username,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            roles,
        };

        return res.json({
            success: true,
            user: userData,
        });
    } catch (err) {
        res.clearCookie("accessToken", COOKIE_OPTIONS);
        res.clearCookie("refreshToken", COOKIE_OPTIONS);
        next(err);
    }
};