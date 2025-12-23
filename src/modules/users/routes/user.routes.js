const express = require("express");
const controller = require("../controllers/user.controller");
const {protect} = require("../../auth/middlewares/auth.middleware");

const router = express.Router();


router.use(protect);

router.get("/", controller.getUsers);
router.get("/:id", controller.getUserById);
router.post("/", controller.createUser);
router.put("/:id", controller.updateUser);
router.delete("/:id", controller.deleteUser);
router.patch("/:userId/permissions", controller.updateUserPermission);

module.exports = router;
