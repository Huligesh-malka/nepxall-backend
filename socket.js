const { Server } = require("socket.io");
let io;
const onlineUsers = new Map();

/* Consistent Room Generator for Private Chats */
const getPrivateRoom = (a, b) => {
  const ids = [String(a), String(b)].sort();
  return `private_${ids[0]}_${ids[1]}`;
};

const initSocket = (server) => {
  io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket) => {
    // --- USER REGISTRATION ---
    socket.on("register", (firebaseUid) => {
      if (!firebaseUid) return;
      if (!onlineUsers.has(firebaseUid)) onlineUsers.set(firebaseUid, new Set());
      onlineUsers.get(firebaseUid).add(socket.id);
      socket.firebaseUid = firebaseUid;
      io.emit("user_online", firebaseUid);
    });

    /* =========================================================
        📢 PG COMMUNITY & ANNOUNCEMENT LOGIC (SYNCHRONIZED)
    ========================================================= */

    // Join a room for a specific PG
    socket.on("join_pg_room", (pgId) => {
      if (!pgId) return;
      const room = `pg_${pgId}`;
      socket.join(room);
      console.log(`User ${socket.id} joined PG Room: ${room}`);
    });

    // Handle Official Announcements
    // Triggered after the DB has successfully saved the record
    socket.on("send_announcement", (data) => {
      const room = `pg_${data.pg_id}`;
      // Broadcast to everyone in the PG room
      io.to(room).emit("receive_announcement", data);
      io.to(room).emit("receive_pg_message", data); 
    });

    // Handle Community Group Chat Messages
    socket.on("send_pg_message", (data) => {
      const room = `pg_${data.pg_id}`;
      // Send to others in chat
      socket.to(room).emit("receive_pg_message", data);
      // 🔥 BRIDGE: Update the announcement board for tenants in real-time
      io.to(room).emit("receive_announcement", data); 
    });

    socket.on("edit_pg_message", (data) => {
      const room = `pg_${data.pg_id}`;
      io.to(room).emit("message_updated", { id: data.id, message: data.message });
    });

    socket.on("delete_pg_message", (data) => {
      const room = `pg_${data.pg_id}`;
      io.to(room).emit("message_deleted", { id: data.id });
    });

    /* =========================================================
        💬 PRIVATE CHAT LOGIC
    ========================================================= */

    socket.on("join_private_room", ({ userA, userB }) => {
      if (!userA || !userB) return;
      const room = getPrivateRoom(userA, userB);
      socket.join(room);
    });

    socket.on("send_private_message", (data) => {
      const room = getPrivateRoom(data.sender_id, data.receiver_id);
      socket.to(room).emit("receive_private_message", data);
    });

    // --- DISCONNECT ---
    socket.on("disconnect", () => {
      const uid = socket.firebaseUid;
      if (uid && onlineUsers.has(uid)) {
        onlineUsers.get(uid).delete(socket.id);
        if (onlineUsers.get(uid).size === 0) {
          onlineUsers.delete(uid);
          io.emit("user_offline", uid);
        }
      }
    });
  });
};

module.exports = { initSocket };