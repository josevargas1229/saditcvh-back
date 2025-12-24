const express = require("express");
const router = express.Router();
const controller = require("../controllers/permission.controller");


router.get("/", controller.getPermissions);

module.exports = router;