const express = require("express");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");

const config = require("./config");
const routes = require("./routes");
const { notFoundHandler, errorHandler } = require("./middlewares/errorHandlers");
const userRoutes = require("./modules/users/routes/user.routes");
const roleRoutes = require("./modules/roles/routes/roles.routes");
const cargoRoutes = require("./modules/cargo/routes/cargo.routes");

const app = express();

app.disable("etag");
app.use((req, res, next) => {
    res.removeHeader("Server");
    next();
});
app.use(config.helmet);
app.use(config.rateLimiter);
app.use(config.cors);

// Logging
if (process.env.NODE_ENV !== "production") {
    app.use(morgan("dev"));
}

// Parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// CSRF 
app.use(config.csrf.doubleCsrfProtection);

// CSRF token endpoint 
app.get("/api/csrf-token", (req, res) => {
    const token = req.csrfToken();
    res.json({ csrfToken: token });
});

// Rutas
app.use("/api", routes);
app.use("/api/users", userRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/cargos", cargoRoutes);

// 404
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

module.exports = app;
