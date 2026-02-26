module.exports = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    console.log("🛡️ AdminMiddleware UID:", req.user.firebaseUid);

    if (req.user.role !== "admin") {
      console.log("⛔ Not admin, role =", req.user.role);
      return res.status(403).json({ message: "Admin access required" });
    }

    console.log("✅ Admin verified");

    next();

  } catch (err) {
    console.error("❌ Admin middleware error:", err);
    res.status(500).json({ message: "Admin verification failed" });
  }
};