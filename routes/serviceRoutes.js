const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");

const {
  bookService,
  getUserServices,
  getOwnerServices,
  updateServiceStatus
} = require("../controllers/serviceController");

// USER
router.post("/book", auth, bookService);
router.get("/user", auth, getUserServices);

// OWNER
router.get("/owner", auth, getOwnerServices);
router.put("/status/:id", auth, updateServiceStatus);

module.exports = router;