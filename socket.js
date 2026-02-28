const { Server } = require("socket.io");
const db = require("./db"); // Add this import

let io;
const onlineUsers = new Map(); // Stores socket IDs by Firebase UID
const dbIdToFirebaseUid = new Map(); // NEW: Maps database ID to Firebase UID

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
    socket.on("register", async (data) => {
      try {
        // Handle both string and object formats
        let firebaseUid, databaseId;
        
        if (typeof data === 'string') {
          firebaseUid = data;
          // Look up database ID from Firebase UID
          const [rows] = await db.query(
            "SELECT id FROM users WHERE firebase_uid = ?",
            [firebaseUid]
          );
          databaseId = rows[0]?.id;
        } else {
          firebaseUid = data.firebaseUid;
          databaseId = data.databaseId;
        }

        if (!firebaseUid) return;

        // Store by Firebase UID
        if (!onlineUsers.has(firebaseUid)) {
          onlineUsers.set(firebaseUid, new Set());
        }
        onlineUsers.get(firebaseUid).add(socket.id);

        // Store mapping from database ID to Firebase UID
        if (databaseId) {
          dbIdToFirebaseUid.set(String(databaseId), firebaseUid);
          
          // Also store by database ID for easy lookup
          if (!onlineUsers.has(`db_${databaseId}`)) {
            onlineUsers.set(`db_${databaseId}`, new Set());
          }
          onlineUsers.get(`db_${databaseId}`).add(socket.id);
        }

        socket.firebaseUid = firebaseUid;
        socket.databaseId = databaseId;

        // Broadcast online status
        io.emit("user_online", { 
          userId: firebaseUid, 
          databaseId: databaseId 
        });

        console.log("✅ Registered:", { 
          firebaseUid, 
          databaseId, 
          socketId: socket.id 
        });

      } catch (err) {
        console.error("❌ Register error:", err);
      }
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

    socket.on("send_private_message", async (data) => {
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

        // Emit chat list updates
        await emitChatListUpdateToUser(data.sender_id, data.sender_firebase_uid);
        await emitChatListUpdateToUser(data.receiver_id, data.receiver_firebase_uid);

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
      const dbId = socket.databaseId;

      if (uid && onlineUsers.has(uid)) {
        onlineUsers.get(uid).delete(socket.id);
        if (onlineUsers.get(uid).size === 0) {
          onlineUsers.delete(uid);
        }
      }

      if (dbId && onlineUsers.has(`db_${dbId}`)) {
        onlineUsers.get(`db_${dbId}`).delete(socket.id);
        if (onlineUsers.get(`db_${dbId}`).size === 0) {
          onlineUsers.delete(`db_${dbId}`);
        }
      }

      io.emit("user_offline", { userId: uid, databaseId: dbId });

      console.log("🔴 Disconnected:", socket.id);
    });
  });

  return io;
};

/* =========================================================
   🎯 EMIT CHAT LIST UPDATE TO SPECIFIC USER
========================================================= */
const emitChatListUpdateToUser = async (userId, firebaseUid = null) => {
  if (!userId) return;

  // If we have Firebase UID directly, use it
  if (firebaseUid) {
    const sockets = onlineUsers.get(firebaseUid);
    if (sockets && sockets.size > 0) {
      console.log("📋 Emitting chat_list_update to Firebase UID:", firebaseUid);
      sockets.forEach((socketId) => {
        io.to(socketId).emit("chat_list_update");
      });
      return;
    }
  }

  // Try to find by database ID
  const dbIdStr = String(userId);
  
  // Check if we have a direct mapping
  const mappedFirebaseUid = dbIdToFirebaseUid.get(dbIdStr);
  if (mappedFirebaseUid) {
    const sockets = onlineUsers.get(mappedFirebaseUid);
    if (sockets && sockets.size > 0) {
      console.log("📋 Emitting chat_list_update to mapped Firebase UID:", mappedFirebaseUid);
      sockets.forEach((socketId) => {
        io.to(socketId).emit("chat_list_update");
      });
      return;
    }
  }

  // Try the db_ prefix
  const dbSockets = onlineUsers.get(`db_${dbIdStr}`);
  if (dbSockets && dbSockets.size > 0) {
    console.log("📋 Emitting chat_list_update to database ID:", dbIdStr);
    dbSockets.forEach((socketId) => {
      io.to(socketId).emit("chat_list_update");
    });
    return;
  }

  // Last resort: try to look up from database
  try {
    const [rows] = await db.query(
      "SELECT firebase_uid FROM users WHERE id = ?",
      [userId]
    );
    
    if (rows[0]?.firebase_uid) {
      const fbUid = rows[0].firebase_uid;
      const sockets = onlineUsers.get(fbUid);
      if (sockets && sockets.size > 0) {
        console.log("📋 Emitting chat_list_update to DB-looked-up Firebase UID:", fbUid);
        sockets.forEach((socketId) => {
          io.to(socketId).emit("chat_list_update");
        });
      }
    }
  } catch (err) {
    console.error("Error looking up user in database:", err);
  }
};

/* =========================================================
   🧠 HELPERS
========================================================= */

const getIO = () => io;

const isUserOnline = (userId) => {
  // Check both Firebase UID and database ID
  return onlineUsers.has(String(userId)) || 
         onlineUsers.has(`db_${userId}`) ||
         (dbIdToFirebaseUid.has(String(userId)) && 
          onlineUsers.has(dbIdToFirebaseUid.get(String(userId))));
};

const getUserSockets = (userId) => {
  // Try to get sockets by various methods
  if (onlineUsers.has(String(userId))) {
    return onlineUsers.get(String(userId));
  }
  if (onlineUsers.has(`db_${userId}`)) {
    return onlineUsers.get(`db_${userId}`);
  }
  const fbUid = dbIdToFirebaseUid.get(String(userId));
  if (fbUid && onlineUsers.has(fbUid)) {
    return onlineUsers.get(fbUid);
  }
  return new Set();
};

module.exports = {
  initSocket,
  getIO,
  isUserOnline,
  getUserSockets,
  getPrivateRoom,
  emitChatListUpdateToUser
};