const { Server } = require("socket.io");

let io;
const onlineUsers = new Map();

/* ================= ROOM HELPER ================= */
const getPrivateRoom = (a, b) => {
  const ids = [String(a), String(b)].sort();
  return `private_${ids[0]}_${ids[1]}`;
};

/* ================= INIT SOCKET ================= */
const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        if (origin.includes("localhost")) return callback(null, true);

        if (origin.includes("vercel.app")) return callback(null, true);

        if (
          process.env.FRONTEND_URL &&
          origin === process.env.FRONTEND_URL
        )
          return callback(null, true);

        return callback(null, true);
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log("🟢 Socket connected:", socket.id);

    /* ================= REGISTER USER ================= */
    socket.on("register", (firebaseUid) => {
      if (!firebaseUid) return;

      if (!onlineUsers.has(firebaseUid)) {
        onlineUsers.set(firebaseUid, new Set());
      }

      onlineUsers.get(firebaseUid).add(socket.id);
      socket.firebaseUid = firebaseUid;

      io.emit("user_online", firebaseUid);

      console.log(`✅ User registered → ${firebaseUid}`);
    });

    /* =========================================================
       🏠 PG ROOM
    ========================================================= */

    socket.on("join_pg_room", (pgId) => {
      if (!pgId) return;
      socket.join(`pg_${pgId}`);
    });

    socket.on("leave_pg_room", (pgId) => {
      if (!pgId) return;
      socket.leave(`pg_${pgId}`);
    });

    socket.on("send_announcement", (data) => {
      const room = `pg_${data.pg_id}`;
      io.to(room).emit("receive_announcement", {
        ...data,
        timestamp: new Date(),
      });
    });

    socket.on("send_pg_message", (data) => {
      const room = `pg_${data.pg_id}`;

      socket.to(room).emit("receive_pg_message", {
        ...data,
        timestamp: new Date(),
      });

      socket.emit("message_sent", data);

      if (data.is_important) {
        io.to(room).emit("receive_announcement", data);
      }
    });

    /* =========================================================
       💬 PRIVATE CHAT
    ========================================================= */

    socket.on("join_private_room", ({ userA, userB }) => {
      if (!userA || !userB) return;

      const room = getPrivateRoom(userA, userB);
      socket.join(room);

      console.log(`📩 Joined private room → ${room}`);
    });

    socket.on("leave_private_room", ({ userA, userB }) => {
      if (!userA || !userB) return;
      socket.leave(getPrivateRoom(userA, userB));
    });

    socket.on("send_private_message", (data) => {
      try {
        const room = getPrivateRoom(
          data.sender_id,
          data.receiver_id
        );

        const message = {
          ...data,
          created_at: data.created_at || new Date(),
        };

        socket.to(room).emit("receive_private_message", message);

        socket.emit("message_sent_confirmation", {
          ...message,
          status: "delivered",
        });

        io.emit("chat_list_update");

        console.log("💬 Private message →", room);
      } catch (err) {
        console.error("❌ Private message error", err);
      }
    });

    socket.on("typing", ({ userA, userB, isTyping }) => {
      socket
        .to(getPrivateRoom(userA, userB))
        .emit("user_typing", { userId: userA, isTyping });
    });

    socket.on("mark_messages_read", ({ userA, userB, messageIds }) => {
      socket
        .to(getPrivateRoom(userA, userB))
        .emit("messages_read", { userId: userA, messageIds });
    });

    /* ================= DISCONNECT ================= */
    socket.on("disconnect", () => {
      const uid = socket.firebaseUid;

      if (uid && onlineUsers.has(uid)) {
        onlineUsers.get(uid).delete(socket.id);

        if (onlineUsers.get(uid).size === 0) {
          onlineUsers.delete(uid);
          io.emit("user_offline", uid);
        }
      }

      console.log("🔴 Socket disconnected:", socket.id);
    });
  });

  return io;
};

/* ================= HELPERS ================= */

const isUserOnline = (userId) =>
  onlineUsers.has(userId) && onlineUsers.get(userId).size > 0;

const getUserSockets = (userId) =>
  onlineUsers.get(userId) || new Set();

module.exports = {
  initSocket,
  isUserOnline,
  getUserSockets,
  getPrivateRoom,
};