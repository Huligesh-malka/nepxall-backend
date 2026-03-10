const { Server } = require("socket.io");

let io;
const onlineUsers = new Map();

/* =========================================================
   PRIVATE ROOM HELPER (PG BASED)
========================================================= */
const getPrivateRoom = (a, b, pgId) => {
  const ids = [String(a), String(b)].sort();
  return `private_${ids[0]}_${ids[1]}_pg_${pgId}`;
};

/* =========================================================
   INIT SOCKET SERVER
========================================================= */
const initSocket = (server) => {

  io = new Server(server, {
    cors: {
      origin: "*",
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {

    console.log("🟢 Socket connected:", socket.id);

    /* =========================================================
       REGISTER USER
    ========================================================= */
    socket.on("register", (firebaseUid) => {

      if (!firebaseUid) return;

      if (!onlineUsers.has(firebaseUid)) {
        onlineUsers.set(firebaseUid, new Set());
      }

      onlineUsers.get(firebaseUid).add(socket.id);
      socket.firebaseUid = firebaseUid;

      console.log("👤 Registered:", firebaseUid);

      io.emit("user_online", firebaseUid);

    });

    /* =========================================================
       JOIN PRIVATE ROOM
    ========================================================= */
    socket.on("join_private_room", ({ userA, userB, pg_id }) => {

      if (!userA || !userB || !pg_id) return;

      const room = getPrivateRoom(userA, userB, pg_id);

      socket.join(room);

      console.log("💬 Joined room:", room);

    });

    socket.on("leave_private_room", ({ userA, userB, pg_id }) => {

      if (!userA || !userB || !pg_id) return;

      const room = getPrivateRoom(userA, userB, pg_id);

      socket.leave(room);

      console.log("🚪 Left room:", room);

    });

    /* =========================================================
       SEND PRIVATE MESSAGE
    ========================================================= */
    socket.on("send_private_message", (data) => {

      try {

        if (!data?.sender_id || !data?.receiver_id || !data?.pg_id) return;

        const room = getPrivateRoom(
          data.sender_id,
          data.receiver_id,
          data.pg_id
        );

        const message = {
          ...data,
          created_at: data.created_at || new Date(),
        };

        console.log("📨 Message →", room);

        socket.to(room).emit("receive_private_message", message);

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
       DELETE MESSAGE
    ========================================================= */
    socket.on("delete_private_message", (data) => {

      try {

        const { sender_id, receiver_id, messageId, pg_id } = data;

        if (!sender_id || !receiver_id || !messageId || !pg_id) return;

        const room = getPrivateRoom(sender_id, receiver_id, pg_id);

        socket.to(room).emit("message_deleted", { messageId });
        socket.emit("message_deleted", { messageId });

        emitChatListUpdate(data.sender_firebase_uid);
        emitChatListUpdate(data.receiver_firebase_uid);

        console.log("🗑 Message deleted:", messageId);

      } catch (err) {
        console.error("❌ Delete message error", err);
      }

    });

    /* =========================================================
       TYPING EVENT
    ========================================================= */
    socket.on("typing", ({ userA, userB, pg_id, isTyping }) => {

      const room = getPrivateRoom(userA, userB, pg_id);

      socket.to(room).emit("user_typing", {
        userId: userA,
        isTyping,
      });

    });

    /* =========================================================
       READ RECEIPTS
    ========================================================= */
    socket.on("mark_messages_read", ({ userA, userB, pg_id }) => {

      const room = getPrivateRoom(userA, userB, pg_id);

      io.to(room).emit("messages_read", {
        readerId: userA,
      });

    });

    /* =========================================================
       DISCONNECT
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
   EMIT CHAT LIST UPDATE
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
   HELPERS
========================================================= */

const getIO = () => io;

const isUserOnline = (uid) =>
  onlineUsers.has(uid) && onlineUsers.get(uid).size > 0;

const getUserSockets = (uid) =>
  onlineUsers.get(uid) || new Set();

module.exports = {
  initSocket,
  getIO,
  isUserOnline,
  getUserSockets,
  getPrivateRoom,
};