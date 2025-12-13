const express = require("express");
const router = express.Router();
const controller = require("../controllers/roles.controller");


router.get("/", controller.getRoles);
router.post("/", controller.createRole);
router.put("/:id", controller.updateRole);
router.delete("/:id", controller.deleteRole);

module.exports = router;