const express = require("express");
const router = express.Router();
const firebaseAuth = require("../middlewares/auth");

const {
  getPlansByProperty
} = require("../controllers/membershipController");

router.get("/plans", firebaseAuth, getPlansByProperty);

module.exports = router;