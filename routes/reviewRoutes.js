const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");

/* ================= REVIEW ROUTES ================= */

// add or update review
router.post("/", reviewController.addReview);

// owner reply (with ownership check)
router.post("/reply", reviewController.addOwnerReply);

// get reviews by PG
router.get("/:pgId", reviewController.getReviewsByPG);

module.exports = router;
