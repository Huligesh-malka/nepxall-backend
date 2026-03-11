const { Server } = require("socket.io");

let io;
const onlineUsers = new Map();

/* =========================================================
   🏠 ROOM HELPER (UPDATED WITH PG ID)
========================================================= */
const getPrivateRoom = (a, b, pg_id) => {
  const ids = [String(a), String(b)].sort();
  return `private_${ids[0]}_${ids[1]}_pg${pg_id}`;
};

/* =========================================================
   🚀 INIT SOCKET
========================================================= */
const initSocket = (server) => {

  io = new Server(server, {
    cors: {
      origin: (origin, callback) => callback(null, true),
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

      io.emit("user_online", firebaseUid);

    });

    /* =========================================================
       💬 JOIN PRIVATE CHAT ROOM
    ========================================================= */
    socket.on("join_private_room", ({ userA, userB, pg_id }) => {

      if (!userA || !userB || !pg_id) return;

      const room = getPrivateRoom(userA, userB, pg_id);

      socket.join(room);

      console.log("📥 Joined room:", room);

    });

    socket.on("leave_private_room", ({ userA, userB, pg_id }) => {

      if (!userA || !userB || !pg_id) return;

      const room = getPrivateRoom(userA, userB, pg_id);

      socket.leave(room);

    });

    /* =========================================================
       📤 SEND PRIVATE MESSAGE
    ========================================================= */
    socket.on("send_private_message", (data) => {

      try {

        const { sender_id, receiver_id, pg_id } = data;

        if (!sender_id || !receiver_id || !pg_id) return;

        const room = getPrivateRoom(sender_id, receiver_id, pg_id);

        const message = {
          ...data,
          created_at: data.created_at || new Date(),
        };

        /* 📩 SEND TO RECEIVER */
        socket.to(room).emit("receive_private_message", message);

        /* ✅ CONFIRM DELIVERY */
        socket.emit("message_sent_confirmation", {
          ...message,
          status: "delivered",
        });

        emitChatListUpdate(data.sender_firebase_uid);
        emitChatListUpdate(data.receiver_firebase_uid);

      } catch (err) {

        console.error("❌ Private message error", err);

      }

    });

    /* =========================================================
       🗑 DELETE MESSAGE
    ========================================================= */
    socket.on("delete_private_message", (data) => {

      try {

        const { sender_id, receiver_id, pg_id, messageId } = data;

        if (!sender_id || !receiver_id || !pg_id || !messageId) return;

        const room = getPrivateRoom(sender_id, receiver_id, pg_id);

        socket.to(room).emit("message_deleted", { messageId });

        socket.emit("message_deleted", { messageId });

        emitChatListUpdate(data.sender_firebase_uid);
        emitChatListUpdate(data.receiver_firebase_uid);

        console.log("🗑 Message deleted →", room);

      } catch (err) {

        console.error("❌ Delete message error", err);

      }

    });

    /* =========================================================
       ✍️ TYPING
    ========================================================= */
    socket.on("typing", ({ userA, userB, pg_id, isTyping }) => {

      const room = getPrivateRoom(userA, userB, pg_id);

      socket
        .to(room)
        .emit("user_typing", { userId: userA, isTyping });

    });

    /* =========================================================
       👀 READ RECEIPT
    ========================================================= */
    socket.on("mark_messages_read", ({ userA, userB, pg_id, messageIds }) => {

      const room = getPrivateRoom(userA, userB, pg_id);

      io.to(room).emit("messages_read", {
        readerId: userA,
        messageIds: messageIds || [],
      });

    });

    /* =========================================================
       🔴 DISCONNECT
    ========================================================= */
    socket.on("disconnect", () => {

      const uid = socket.firebaseUid;

      if (uid && onlineUsers.has(uid)) {

        onlineUsers.get(uid).delete(socket.id);

        if (onlineUsers.get(uid).size === 0) {

          onlineUsers.delete(uid);

          io.emit("user_offline", uid);

        }

      }

      console.log("🔴 Disconnected:", socket.id);

    });

  });

  return io;
};

/* =========================================================
   🎯 EMIT CHAT LIST UPDATE
========================================================= */
const emitChatListUpdate = (firebaseUid) => {

  if (!firebaseUid) return;

  const sockets = onlineUsers.get(firebaseUid);
  if (!sockets) return;

  sockets.forEach((id) => {
    io.to(id).emit("chat_list_update");
  });

};

/* =========================================================
   🧠 HELPERS
========================================================= */

const getIO = () => io;

const isUserOnline = (userId) =>
  onlineUsers.has(userId) && onlineUsers.get(userId).size > 0;

const getUserSockets = (userId) =>
  onlineUsers.get(userId) || new Set();

module.exports = {
  initSocket,
  getIO,
  isUserOnline,
  getUserSockets,
  getPrivateRoom,
};