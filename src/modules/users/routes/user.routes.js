/**
 * RUTAS: UserRoutes
 */
const express = require("express");
const controller = require("../controllers/user.controller");
const { protect, restrictTo } = require("../../auth/middlewares/auth.middleware");
const router = express.Router();

//roteger todas las rutas (Usuario debe estar logueado)
router.use(protect);

//Endpoints de Perfil (Cualquier usuario logueado)
router.get("/my-territories", controller.getMyTerritories);

// Endpoints de Administración (SOLO ADMINS)

// Ver lista de usuarios
router.get("/", restrictTo('administrador'), controller.getUsers);

// Ver detalle
router.get("/:id", restrictTo('administrador'), controller.getUserById);

// Crear usuario
router.post("/", restrictTo('administrador'), controller.createUser);

// Actualizar usuario
router.put("/:id", restrictTo('administrador'), controller.updateUser);

// Eliminar usuario
router.delete("/:id", restrictTo('administrador'), controller.deleteUser);

// Matriz de Permisos
router.put("/:userId/permissions/batch", restrictTo('administrador'), controller.updatePermissionsBatch);
router.patch("/:userId/permissions", restrictTo('administrador'), controller.updateUserPermission);
router.get("/:id/permissions-raw", restrictTo('administrador'), controller.getUserPermissionsRaw);

module.exports = router;