const express = require("express");
const router = express.Router();
const firebaseAuth = require("../middlewares/authMiddleware");

const adminController = require("../controllers/adminRefundController");

// 👑 ADMIN REFUNDS
router.get("/refunds", firebaseAuth, adminController.getAllRefunds);

router.post("/refunds/:id/approve", firebaseAuth, adminController.approveRefund);



router.post("/refunds/:id/paid", firebaseAuth, adminController.markRefundPaidAdmin);

module.exports = router;