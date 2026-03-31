const { Server } = require("socket.io");

let io;

/* =========================================================
   ONLINE USERS MAP
   firebase_uid-> Set(socketIds)
========================================================= */
const onlineUsers = new Map();

/* =========================================================
   ROOM HELPER
========================================================= */
const getPrivateRoom = (a, b, pg_id) => {

  if (!a || !b || !pg_id) return null;

  const ids = [String(a), String(b)].sort();

  return `private_${ids[0]}_${ids[1]}_pg${pg_id}`;
};

/* =========================================================
   INIT SOCKET SERVER
========================================================= */
const initSocket = (server) => {

  io = new Server(server, {
    cors: {
      origin: (origin, callback) => callback(null, true),
      credentials: true,
      methods: ["GET", "POST"]
    },
    transports: ["websocket"]
  });

  io.on("connection", (socket) => {

    console.log("🟢 Socket connected:", socket.id);

    /* =====================================================
       REGISTER USER
    ===================================================== */
    socket.on("register", (firebase_uid) => {

      if (!firebase_uid) return;

      if (!onlineUsers.has(firebase_uid)) {
        onlineUsers.set(firebase_uid, new Set());
      }

      onlineUsers.get(firebase_uid).add(socket.id);

      socket.firebase_uid= firebase_uid;

      io.emit("user_online", firebase_uid);

    });

    /* =====================================================
       JOIN PRIVATE ROOM
    ===================================================== */
    socket.on("join_private_room", ({ userA, userB, pg_id }) => {

      const room = getPrivateRoom(userA, userB, pg_id);

      if (!room) return;

      socket.join(room);

      console.log("📥 Joined room:", room);

    });

    /* =====================================================
       LEAVE PRIVATE ROOM
    ===================================================== */
    socket.on("leave_private_room", ({ userA, userB, pg_id }) => {

      const room = getPrivateRoom(userA, userB, pg_id);

      if (!room) return;

      socket.leave(room);

    });

    /* =====================================================
       SEND PRIVATE MESSAGE
    ===================================================== */
    socket.on("send_private_message", (data) => {

      try {

        const { sender_id, receiver_id, pg_id } = data;

        if (!sender_id || !receiver_id || !pg_id) return;

        const room = getPrivateRoom(sender_id, receiver_id, pg_id);

        if (!room) return;

        const message = {
          ...data,
          created_at: data.created_at || new Date(),
        };

        /* SEND TO RECEIVER */
        socket.to(room).emit("receive_private_message", message);

        /* CONFIRM TO SENDER */
        socket.emit("message_sent_confirmation", {
          ...message,
          status: "delivered",
        });

        emitChatListUpdate(data.sender_firebase_uid);
        emitChatListUpdate(data.receiver_firebase_uid);

      } catch (err) {

        console.error("❌ Message error:", err);

      }

    });

    /* =====================================================
       DELETE MESSAGE
    ===================================================== */
    socket.on("delete_private_message", (data) => {

      try {

        const { sender_id, receiver_id, pg_id, messageId } = data;

        const room = getPrivateRoom(sender_id, receiver_id, pg_id);

        if (!room || !messageId) return;

        io.to(room).emit("message_deleted", { messageId });

        emitChatListUpdate(data.sender_firebase_uid);
        emitChatListUpdate(data.receiver_firebase_uid);

        console.log("🗑 Message deleted:", messageId);

      } catch (err) {

        console.error("❌ Delete error:", err);

      }

    });

    /* =====================================================
       TYPING INDICATOR
    ===================================================== */
    socket.on("typing", ({ userA, userB, pg_id, isTyping }) => {

      const room = getPrivateRoom(userA, userB, pg_id);

      if (!room) return;

      socket.to(room).emit("user_typing", {
        userId: userA,
        isTyping
      });

    });

    /* =====================================================
       READ RECEIPTS
    ===================================================== */
    socket.on("mark_messages_read", ({ userA, userB, pg_id, messageIds }) => {

      const room = getPrivateRoom(userA, userB, pg_id);

      if (!room) return;

      io.to(room).emit("messages_read", {
        readerId: userA,
        messageIds: messageIds || []
      });

    });

    /* =====================================================
       DISCONNECT
    ===================================================== */
    socket.on("disconnect", () => {

      const uid = socket.firebase_uid;

      if (uid && onlineUsers.has(uid)) {

        const sockets = onlineUsers.get(uid);

        sockets.delete(socket.id);

        if (sockets.size === 0) {

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
   EMIT CHAT LIST UPDATE
========================================================= */
const emitChatListUpdate = (firebase_uid) => {

  if (!firebase_uid) return;

  const sockets = onlineUsers.get(firebase_uid);

  if (!sockets) return;

  sockets.forEach(socketId => {
    io.to(socketId).emit("chat_list_update");
  });

};

/* =========================================================
   HELPERS
========================================================= */

const getIO = () => io;

const isUserOnline = (firebase_uid) =>
  onlineUsers.has(firebase_uid) && onlineUsers.get(firebase_uid).size > 0;

const getUserSockets = (firebase_uid) =>
  onlineUsers.get(firebase_uid) || new Set();

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  initSocket,
  getIO,
  isUserOnline,
  getUserSockets,
  getPrivateRoom
};