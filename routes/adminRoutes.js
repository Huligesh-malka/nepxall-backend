const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth");
const adminOnly = require("../middlewares/admin");
const adminController = require("../controllers/adminController");

/* ✅ ADMIN HEALTH */
router.get("/health", (req, res) => {
  res.json({ success: true, message: "Admin API working" });
});

/* ✅ PG APPROVAL */
router.get("/pgs/pending", auth, adminOnly, adminController.getPendingPGs);
router.get("/pg/:id", auth, adminOnly, adminController.getPGById);
router.patch("/pg/:id/approve", auth, adminOnly, adminController.approvePG);
router.patch("/pg/:id/reject", auth, adminOnly, adminController.rejectPG);

module.exports = router;