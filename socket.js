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
       💬 PRIVATE CHAT
    ========================================================= */

    socket.on("join_private_room", ({ userA, userB }) => {
      if (!userA || !userB) return;
      socket.join(getPrivateRoom(userA, userB));
    });

    socket.on("leave_private_room", ({ userA, userB }) => {
      if (!userA || !userB) return;
      socket.leave(getPrivateRoom(userA, userB));
    });

    /* ================= SEND MESSAGE ================= */
    socket.on("send_private_message", (data) => {

      try {

        if (!data?.sender_id || !data?.receiver_id) return;

        const room = getPrivateRoom(
          data.sender_id,
          data.receiver_id
        );

        const message = {
          ...data,
          created_at: data.created_at || new Date(),
        };

        /* 📩 SEND TO RECEIVER */
        socket.to(room).emit("receive_private_message", message);

        /* ✅ CONFIRM TO SENDER */
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

        const { sender_id, receiver_id, messageId } = data;

        if (!sender_id || !receiver_id || !messageId) return;

        const room = getPrivateRoom(sender_id, receiver_id);

        /* 🔥 REMOVE FOR RECEIVER */
        socket.to(room).emit("message_deleted", { messageId });

        /* 🔥 REMOVE FOR SENDER OTHER TABS */
        socket.emit("message_deleted", { messageId });

        emitChatListUpdate(data.sender_firebase_uid);
        emitChatListUpdate(data.receiver_firebase_uid);

        console.log("🗑 Message deleted →", room);

      } catch (err) {
        console.error("❌ Delete message error", err);
      }

    });

    /* ================= TYPING ================= */
    socket.on("typing", ({ userA, userB, isTyping }) => {

      socket
        .to(getPrivateRoom(userA, userB))
        .emit("user_typing", { userId: userA, isTyping });

    });

    /* =========================================================
       🚦 READ RECEIPT
    ========================================================= */
    socket.on("mark_messages_read", ({ userA, userB, messageIds }) => {

      const room = getPrivateRoom(userA, userB);

      io.to(room).emit("messages_read", {
        readerId: userA,
        messageIds: messageIds || [],
      });

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