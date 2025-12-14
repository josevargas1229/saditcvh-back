const express = require("express");
const router = express.Router();
const controller = require("../controllers/roles.controller");


router.get("/", controller.getRoles);

router.get("/counts", controller.getRoleCounts);

router.post("/", controller.createRole);
router.put("/:id", controller.updateRole);
router.delete("/:id", controller.deleteRole);

module.exports = router;