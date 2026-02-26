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
initSocket(server);

/* 🚀 START SERVER */
server.listen(PORT, () => {
  console.log("=================================");
  console.log(`🚀 Server running in ${process.env.NODE_ENV || "development"} mode`);
  console.log(`📡 Port: ${PORT}`);

  const baseUrl =
    process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

  console.log(`🌐 Base URL: ${baseUrl}`);
  console.log(`❤️ Health: ${baseUrl}/api/health`);
  console.log(`🔧 Diagnostic: ${baseUrl}/api/diagnose`);
  console.log("=================================");
});