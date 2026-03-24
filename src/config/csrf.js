const { doubleCsrf } = require("csrf-csrf");

const {
    invalidCsrfTokenError,
    generateToken,
    validateRequest,
    doubleCsrfProtection,
} = doubleCsrf({
    getSecret: () => process.env.CSRF_SECRET,

    getSessionIdentifier: (req) => {
        return req.ip + req.headers["user-agent"];
    },

    cookieName: "x-csrf-token",

    cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 1000 * 60 * 60 * 2, // 2 horas
        secure: false,
    },
});

module.exports = {
    invalidCsrfTokenError,
    generateToken,
    validateRequest,
    doubleCsrfProtection,
};
