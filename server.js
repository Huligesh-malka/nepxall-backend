const http = require("http");
const app = require("./app");
const { initSocket } = require("./socket");

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

/* 🔥 INIT SOCKET */
initSocket(server);

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Health: http://localhost:${PORT}/api/health`);
});
