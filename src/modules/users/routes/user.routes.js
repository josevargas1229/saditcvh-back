/**
 * RUTAS: UserRoutes
 * DESCRIPCIÓN: Definición de servicios para la gestión de usuarios y seguridad granular.
 */
const express = require("express");
const controller = require("../controllers/user.controller");
const { protect } = require("../../auth/middlewares/auth.middleware");

const router = express.Router();

router.use(protect);

// --- Endpoints de Perfil ---
router.get("/my-territories", controller.getMyTerritories);

// --- Endpoints de Administración ---
router.get("/", controller.getUsers);
router.get("/:id", controller.getUserById);
router.post("/", controller.createUser);
router.put("/:id", controller.updateUser);
router.delete("/:id", controller.deleteUser);

// Gestión de excepciones de permisos
router.patch("/:userId/permissions", controller.updateUserPermission);

module.exports = router;