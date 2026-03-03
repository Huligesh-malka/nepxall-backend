const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const {
  bookService,
  getUserServices,
  getOwnerServices,
  updateServiceStatus
} = require("../controllers/serviceController");

// Path: /api/services/...
router.post("/book", auth, bookService);
router.get("/user", auth, getUserServices);
router.get("/owner", auth, getOwnerServices);
router.put("/status/:id", auth, updateServiceStatus);

module.exports = router;