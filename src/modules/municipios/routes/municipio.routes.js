const express = require("express");
const router = express.Router();
const controller = require("../controllers/municipio.controller");

router.get("/", controller.getMunicipios);
router.get("/:id", controller.getMunicipioById);

module.exports = router;