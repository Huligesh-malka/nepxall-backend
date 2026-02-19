// routes/adminRoutes.js
const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const adminOnly = require("../middlewares/admin");
const adminController = require("../controllers/adminController");

// Pending PGs
router.get("/pgs/pending", auth, adminOnly, adminController.getPendingPGs);

// Single PG
router.get("/pg/:id", auth, adminOnly, adminController.getPGById);

// Approve PG
router.patch("/pg/:id/approve", auth, adminOnly, adminController.approvePG);

// Reject PG
router.patch("/pg/:id/reject", auth, adminOnly, adminController.rejectPG);

module.exports = router;
