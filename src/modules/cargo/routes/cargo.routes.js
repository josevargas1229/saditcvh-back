const express = require("express");
const router = express.Router();
const controller = require("../controllers/cargo.controller");

router.get("/", controller.getCargos);
router.post("/", controller.createCargo);
router.put("/:id", controller.updateCargo);
router.delete("/:id", controller.deleteCargo);

module.exports = router;