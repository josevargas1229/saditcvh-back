const express = require("express");
const controller = require("../controllers/auth.controller");
const { loginValidation } = require("../middlewares/auth.validation");
const { protect } = require("../middlewares/auth.middleware");

const router = express.Router();

// POST /api/auth/login
router.post("/login", loginValidation, controller.login);

// POST /api/auth/logout
router.post("/logout", protect, controller.logout);
// GET /api/auth/check-status
router.post("/check-status", controller.checkStatus);
// POST /api/auth/refresh-token
router.post("/refresh-token", controller.refreshToken);

module.exports = router;