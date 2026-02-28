const { Server } = require("socket.io");

let io;
const onlineUsers = new Map();

/* =========================================================
   🏠 ROOM HELPER
========================================================= */
const getPrivateRoom = (a, b) => {
  const ids = [String(a), String(b)].sort();
  return `private_${ids[0]}_${ids[1]}`;
};

/* =========================================================
   🚀 INIT SOCKET
========================================================= */
const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (origin.includes("localhost")) return callback(null, true);
        if (origin.includes("vercel.app")) return callback(null, true);
        if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("🟢 Socket connected:", socket.id);

    /* ================= REGISTER ================= */
    socket.on("register", (firebaseUid) => {
      if (!firebaseUid) return;

      if (!onlineUsers.has(firebaseUid)) {
        onlineUsers.set(firebaseUid, new Set());
      }

      onlineUsers.get(firebaseUid).add(socket.id);
      socket.firebaseUid = firebaseUid;

      // Broadcast to all that this user is online
      io.emit("user_online", { userId: firebaseUid });

      console.log("✅ Registered:", firebaseUid, "Socket:", socket.id);
    });

    /* =========================================================
       💬 PRIVATE CHAT
    ========================================================= */

    socket.on("join_private_room", ({ userA, userB }) => {
      if (!userA || !userB) return;

      const room = getPrivateRoom(userA, userB);
      socket.join(room);

      console.log("📩 Joined room:", room, "Socket:", socket.id);
    });

    socket.on("leave_private_room", ({ userA, userB }) => {
      if (!userA || !userB) return;
      socket.leave(getPrivateRoom(userA, userB));
    });

    socket.on("send_private_message", (data) => {
      try {
        if (!data?.sender_id || !data?.receiver_id) return;

        const room = getPrivateRoom(data.sender_id, data.receiver_id);
        
        const message = {
          ...data,
          created_at: data.created_at || new Date(),
          status: "delivered"
        };

        console.log("💬 Sending message to room:", room, message);

        // Send to room (receiver)
        socket.to(room).emit("receive_private_message", message);

        // Send confirmation to sender
        socket.emit("message_sent_confirmation", message);

        // Emit chat list updates to both users
        // We need to get their firebase UIDs from the database
        // For now, we'll emit to all their sockets
        emitChatListUpdateToUser(data.sender_firebase_uid || data.sender_id);
        emitChatListUpdateToUser(data.receiver_firebase_uid || data.receiver_id);

      } catch (err) {
        console.error("❌ Private message error", err);
      }
    });

    /* ================= TYPING ================= */
    socket.on("typing", ({ userA, userB, isTyping }) => {
      socket
        .to(getPrivateRoom(userA, userB))
        .emit("user_typing", { userId: userA, isTyping });
    });

    /* ================= READ ================= */
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
          io.emit("user_offline", { userId: uid });
        }
      }

      console.log("🔴 Disconnected:", socket.id);
    });
  });

  return io;
};

/* =========================================================
   🎯 EMIT CHAT LIST UPDATE TO SPECIFIC USER
========================================================= */
const emitChatListUpdateToUser = (userId) => {
  if (!userId) return;

  const sockets = onlineUsers.get(String(userId));
  if (!sockets || sockets.size === 0) return;

  console.log("📋 Emitting chat_list_update to user:", userId, "Sockets:", Array.from(sockets));

  sockets.forEach((socketId) => {
    io.to(socketId).emit("chat_list_update");
  });
};

/* =========================================================
   🧠 HELPERS
========================================================= */

const getIO = () => io;

const isUserOnline = (userId) => {
  return onlineUsers.has(String(userId)) && onlineUsers.get(String(userId)).size > 0;
};

const getUserSockets = (userId) => {
  return onlineUsers.get(String(userId)) || new Set();
};

module.exports = {
  initSocket,
  getIO,
  isUserOnline,
  getUserSockets,
  getPrivateRoom,
  emitChatListUpdateToUser
};