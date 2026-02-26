/* ✅ LOAD ENV ONLY IN DEVELOPMENT */
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const http = require("http");
const app = require("./app");
const { initSocket } = require("./socket");

const PORT = process.env.PORT || 5000;

/* 🌍 CREATE HTTP SERVER */
const server = http.createServer(app);

/* 🔥 INIT SOCKET.IO */
try {
  initSocket(server);
  console.log("✅ Socket.IO initialized");
} catch (error) {
  console.error("❌ Socket.IO initialization failed:", error.message);
}

/* 🚀 START SERVER */
server.listen(PORT, "0.0.0.0", () => {
  console.log("\n=================================");
  console.log(`🚀 Server running in ${process.env.NODE_ENV || "development"} mode`);
  console.log(`📡 Port: ${PORT}`);

  const baseUrl =
    process.env.RENDER_EXTERNAL_URL || 
    process.env.BASE_URL || 
    `http://localhost:${PORT}`;

  console.log(`🌐 Base URL: ${baseUrl}`);
  console.log(`❤️ Health: ${baseUrl}/api/health`);
  console.log(`🔧 Diagnostic: ${baseUrl}/api/diagnose`);
  console.log(`🏠 Root: ${baseUrl}/`);
  console.log("=================================\n");
});

/* ================= GRACEFUL SHUTDOWN ================= */
process.on("SIGTERM", () => {
  console.log("📡 SIGTERM received: closing HTTP server");
  server.close(() => {
    console.log("✅ HTTP server closed");
    
    // Close database pool if available
    try {
      const pool = require("./db");
      pool.end().then(() => {
        console.log("✅ Database pool closed");
        process.exit(0);
      }).catch((err) => {
        console.error("❌ Error closing database pool:", err);
        process.exit(1);
      });
    } catch (error) {
      console.log("⚠️ No database pool to close");
      process.exit(0);
    }
  });
});

process.on("SIGINT", () => {
  console.log("📡 SIGINT received: closing HTTP server");
  server.close(() => {
    console.log("✅ HTTP server closed");
    process.exit(0);
  });
});

module.exports = server;