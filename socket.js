const { Server } = require("socket.io");
const db = require("./db"); // Make sure this path is correct

let io;
const onlineUsers = new Map(); // Stores socket IDs by Firebase UID
const dbIdToSocketIds = new Map(); // Maps database ID to socket IDs
const firebaseUidToDbId = new Map(); // Maps Firebase UID to database ID

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
        if (origin.includes("nepxall")) return callback(null, true);
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
        console.log("📝 Register data received:", data);
        
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

        if (!firebaseUid) {
          console.log("❌ No Firebase UID provided");
          return;
        }

        console.log("✅ Registering user:", { firebaseUid, databaseId, socketId: socket.id });

        // Store by Firebase UID
        if (!onlineUsers.has(firebaseUid)) {
          onlineUsers.set(firebaseUid, new Set());
        }
        onlineUsers.get(firebaseUid).add(socket.id);

        // Store mapping from Firebase UID to database ID
        if (databaseId) {
          firebaseUidToDbId.set(firebaseUid, databaseId);
          
          // Store by database ID
          if (!dbIdToSocketIds.has(databaseId)) {
            dbIdToSocketIds.set(databaseId, new Set());
          }
          dbIdToSocketIds.get(databaseId).add(socket.id);
        }

        socket.firebaseUid = firebaseUid;
        socket.databaseId = databaseId;

        // Broadcast online status
        io.emit("user_online", { 
          userId: firebaseUid, 
          databaseId: databaseId 
        });

        console.log("✅ Current online users:", {
          onlineUsers: Array.from(onlineUsers.keys()),
          dbIdToSocketIds: Array.from(dbIdToSocketIds.keys())
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
        if (!data?.sender_id || !data?.receiver_id) {
          console.log("❌ Invalid message data:", data);
          return;
        }

        console.log("💬 Received message to send:", data);

        const room = getPrivateRoom(data.sender_id, data.receiver_id);
        
        const message = {
          ...data,
          created_at: data.created_at || new Date(),
          status: "delivered"
        };

        console.log("💬 Sending to room:", room, message);

        // Send to room (receiver)
        socket.to(room).emit("receive_private_message", message);

        // Send confirmation to sender
        socket.emit("message_sent_confirmation", message);

        // Emit chat list updates
        await emitChatListUpdateToUser(data.sender_id);
        await emitChatListUpdateToUser(data.receiver_id);

      } catch (err) {
        console.error("❌ Private message error", err);
      }
    });

    /* ================= TYPING ================= */
    socket.on("typing", ({ userA, userB, userId, isTyping }) => {
      const room = getPrivateRoom(userA, userB);
      socket.to(room).emit("user_typing", { userId, isTyping });
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

      console.log("🔴 Disconnecting:", { socketId: socket.id, uid, dbId });

      if (uid && onlineUsers.has(uid)) {
        onlineUsers.get(uid).delete(socket.id);
        if (onlineUsers.get(uid).size === 0) {
          onlineUsers.delete(uid);
          firebaseUidToDbId.delete(uid);
        }
      }

      if (dbId && dbIdToSocketIds.has(dbId)) {
        dbIdToSocketIds.get(dbId).delete(socket.id);
        if (dbIdToSocketIds.get(dbId).size === 0) {
          dbIdToSocketIds.delete(dbId);
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
const emitChatListUpdateToUser = async (userId) => {
  if (!userId) return;

  console.log("📋 Emitting chat_list_update for user ID:", userId);

  // Try to find by database ID first
  const dbIdSockets = dbIdToSocketIds.get(Number(userId));
  if (dbIdSockets && dbIdSockets.size > 0) {
    console.log("📋 Found by database ID:", userId, "Sockets:", Array.from(dbIdSockets));
    dbIdSockets.forEach((socketId) => {
      io.to(socketId).emit("chat_list_update");
    });
    return;
  }

  // Try to find by Firebase UID
  const fbSockets = onlineUsers.get(String(userId));
  if (fbSockets && fbSockets.size > 0) {
    console.log("📋 Found by Firebase UID:", userId, "Sockets:", Array.from(fbSockets));
    fbSockets.forEach((socketId) => {
      io.to(socketId).emit("chat_list_update");
    });
    return;
  }

  // Look up in database
  try {
    const [rows] = await db.query(
      "SELECT firebase_uid FROM users WHERE id = ?",
      [userId]
    );
    
    if (rows[0]?.firebase_uid) {
      const fbUid = rows[0].firebase_uid;
      const fbSocketsFromDb = onlineUsers.get(fbUid);
      if (fbSocketsFromDb && fbSocketsFromDb.size > 0) {
        console.log("📋 Found by DB lookup:", fbUid);
        fbSocketsFromDb.forEach((socketId) => {
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
  return onlineUsers.has(String(userId)) || dbIdToSocketIds.has(Number(userId));
};

const getUserSockets = (userId) => {
  if (onlineUsers.has(String(userId))) {
    return onlineUsers.get(String(userId));
  }
  if (dbIdToSocketIds.has(Number(userId))) {
    return dbIdToSocketIds.get(Number(userId));
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