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

  if (process.env.RENDER_EXTERNAL_URL) {
    console.log(`🌍 Live URL: ${process.env.RENDER_EXTERNAL_URL}`);
    console.log(`❤️ Health Check: ${process.env.RENDER_EXTERNAL_URL}/api/health`);
    console.log(`🔧 Diagnostic: ${process.env.RENDER_EXTERNAL_URL}/api/diagnose`);
  } else {
    console.log(`🌐 Local: http://localhost:${PORT}`);
    console.log(`❤️ Health Check: http://localhost:${PORT}/api/health`);
    console.log(`🔧 Diagnostic: http://localhost:${PORT}/api/diagnose`);
  }

  console.log("=================================");
});