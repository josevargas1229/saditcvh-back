const jwt = require("jsonwebtoken");
const { User, Role } = require("../../../database/associations");

/**
 * Middleware PROTECT
 * Verifica el token y carga el usuario en req.user
 */
exports.protect = async (req, res, next) => {
    let token;

    if (req.cookies && req.cookies.accessToken) {
        token = req.cookies.accessToken;
    } else if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
        return res.status(401).json({ success: false, message: "No autorizado. Inicia sesión para continuar." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Buscamos al usuario en la BD para tener sus roles frescos
        const currentUser = await User.findByPk(decoded.id, {
            include: [{ model: Role, as: 'roles', attributes: ['name'] }]
        });

        if (!currentUser) {
            return res.status(401).json({ success: false, message: "El usuario de este token ya no existe." });
        }

        if (!currentUser.active) {
            return res.status(401).json({ success: false, message: "Usuario inactivo." });
        }

        // Guardamos el usuario COMPLETO (con roles) en la request
        req.user = currentUser; 
        next();

    } catch (error) {
        return res.status(401).json({ success: false, message: "Token inválido o expirado." });
    }
};

/**
 * Middleware RESTRICT TO
 * Recibe una lista de roles permitidos (ej: 'administrador', 'supervisor')
 */
exports.restrictTo = (...rolesAllowed) => {
    return (req, res, next) => {
        // req.user ya viene con roles gracias a 'protect'
        if (!req.user || !req.user.roles) {
            return res.status(403).json({ success: false, message: "Acceso denegado." });
        }

        // Convertimos los roles del usuario a un array simple de nombres
        // Asumiendo que req.user.roles es un array de objetos Role [{id:1, name:'administrador'}]
        const userRoles = req.user.roles.map(role => role.name);

        // Verificamos si AL MENOS UNO de los roles del usuario está en la lista permitida
        const hasPermission = userRoles.some(roleName => rolesAllowed.includes(roleName));

        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                message: "No tienes permisos suficientes para realizar esta acción.",
            });
        }
        next();
    };
};