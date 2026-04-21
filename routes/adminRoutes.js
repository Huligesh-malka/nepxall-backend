const express = require("express");
const router = express.Router();

const auth = require("../middlewares/authMiddleware");
const adminOnly = require("../middlewares/admin");
const adminController = require("../controllers/adminController");

/* ================= ADMIN HEALTH ================= */
router.get("/health", (req, res) => {
  res.json({ success: true, message: "Admin API working" });
});

/* ================= PG LIST ================= */
router.get("/pgs/pending", auth, adminOnly, adminController.getPendingPGs);
router.get("/pgs", auth, adminOnly, adminController.getAllPGsAdmin);

/* ================= SINGLE PG ================= */
router.get("/pg/:id", auth, adminOnly, adminController.getPGById);

/* ================= APPROVAL ================= */
router.patch("/pg/:id/approve", auth, adminOnly, adminController.approvePG);
router.patch("/pg/:id/reject", auth, adminOnly, adminController.rejectPG);

/* ================= 🔥 UPDATE FIELD (IMPORTANT) ================= */
router.patch(
  "/pg/:id/update-field",
  auth,
  adminOnly,
  adminController.updatePGField
);

module.exports = router;