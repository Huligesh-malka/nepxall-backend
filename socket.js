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
    cors: { 
      origin: ["http://localhost:3000", "https://nepxall-backend.onrender.com"],
      methods: ["GET", "POST"],
      credentials: true 
    },
  });

  io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);

    // --- USER REGISTRATION ---
    socket.on("register", (firebaseUid) => {
      if (!firebaseUid) return;
      
      // Store user's socket connection
      if (!onlineUsers.has(firebaseUid)) {
        onlineUsers.set(firebaseUid, new Set());
      }
      onlineUsers.get(firebaseUid).add(socket.id);
      socket.firebaseUid = firebaseUid;
      
      // Broadcast to all that user is online
      io.emit("user_online", { userId: firebaseUid, socketId: socket.id });
      console.log(`User ${firebaseUid} registered with socket ${socket.id}`);
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

    // Leave PG room
    socket.on("leave_pg_room", (pgId) => {
      if (!pgId) return;
      const room = `pg_${pgId}`;
      socket.leave(room);
      console.log(`User ${socket.id} left PG Room: ${room}`);
    });

    // Handle Official Announcements
    socket.on("send_announcement", (data) => {
      const room = `pg_${data.pg_id}`;
      // Broadcast to everyone in the PG room
      io.to(room).emit("receive_announcement", {
        ...data,
        timestamp: new Date()
      });
      io.to(room).emit("receive_pg_message", {
        ...data,
        type: 'announcement'
      });
      console.log(`Announcement sent to room ${room}:`, data);
    });

    // Handle Community Group Chat Messages
    socket.on("send_pg_message", (data) => {
      const room = `pg_${data.pg_id}`;
      // Send to others in chat
      socket.to(room).emit("receive_pg_message", {
        ...data,
        timestamp: new Date()
      });
      // Also echo back to sender for confirmation
      socket.emit("message_sent", data);
      
      // 🔥 BRIDGE: Update the announcement board for tenants in real-time
      if (data.is_important) {
        io.to(room).emit("receive_announcement", {
          ...data,
          type: 'important_message'
        });
      }
      console.log(`PG message sent to room ${room}:`, data);
    });

    socket.on("edit_pg_message", (data) => {
      const room = `pg_${data.pg_id}`;
      io.to(room).emit("message_updated", { 
        id: data.id, 
        message: data.message,
        edited_at: new Date()
      });
    });

    socket.on("delete_pg_message", (data) => {
      const room = `pg_${data.pg_id}`;
      io.to(room).emit("message_deleted", { 
        id: data.id,
        deleted_at: new Date()
      });
    });

    /* =========================================================
        💬 PRIVATE CHAT LOGIC
    ========================================================= */

    // Join private chat room
    socket.on("join_private_room", ({ userA, userB }) => {
      if (!userA || !userB) {
        console.error("Missing user IDs for private room");
        return;
      }
      
      const room = getPrivateRoom(userA, userB);
      socket.join(room);
      
      // Notify others in the room that user has joined
      socket.to(room).emit("user_joined_private", { 
        userId: userA,
        timestamp: new Date()
      });
      
      console.log(`Socket ${socket.id} joined private room: ${room} (users: ${userA}, ${userB})`);
    });

    // Leave private chat room
    socket.on("leave_private_room", ({ userA, userB }) => {
      if (!userA || !userB) return;
      const room = getPrivateRoom(userA, userB);
      socket.leave(room);
      
      socket.to(room).emit("user_left_private", { 
        userId: userA,
        timestamp: new Date()
      });
      
      console.log(`Socket ${socket.id} left private room: ${room}`);
    });

    // Send private message
    socket.on("send_private_message", (data) => {
      try {
        const room = getPrivateRoom(data.sender_id, data.receiver_id);
        
        // Add timestamp if not present
        const messageData = {
          ...data,
          created_at: data.created_at || new Date(),
          status: 'sent'
        };
        
        // Broadcast to everyone in the room except sender
        socket.to(room).emit("receive_private_message", messageData);
        
        // Also emit back to sender for confirmation
        socket.emit("message_sent_confirmation", {
          ...messageData,
          status: 'delivered'
        });
        
        console.log(`Private message sent in room ${room}:`, messageData);
      } catch (error) {
        console.error("Error sending private message:", error);
        socket.emit("message_error", { error: "Failed to send message" });
      }
    });

    // Typing indicator
    socket.on("typing", ({ userA, userB, isTyping }) => {
      const room = getPrivateRoom(userA, userB);
      socket.to(room).emit("user_typing", { 
        userId: userA, 
        isTyping,
        timestamp: new Date()
      });
    });

    // Mark messages as read
    socket.on("mark_messages_read", ({ userA, userB, messageIds }) => {
      const room = getPrivateRoom(userA, userB);
      socket.to(room).emit("messages_read", { 
        userId: userA,
        messageIds,
        timestamp: new Date()
      });
    });

    // --- DISCONNECT ---
    socket.on("disconnect", () => {
      const uid = socket.firebaseUid;
      if (uid && onlineUsers.has(uid)) {
        onlineUsers.get(uid).delete(socket.id);
        if (onlineUsers.get(uid).size === 0) {
          onlineUsers.delete(uid);
          io.emit("user_offline", { 
            userId: uid,
            timestamp: new Date()
          });
        }
        console.log(`User ${uid} disconnected, remaining connections: ${onlineUsers.get(uid)?.size || 0}`);
      }
      console.log("Client disconnected:", socket.id);
    });
  });

  return io;
};

// Helper function to get online status
const isUserOnline = (userId) => {
  return onlineUsers.has(userId) && onlineUsers.get(userId).size > 0;
};

// Helper function to get user's socket IDs
const getUserSockets = (userId) => {
  return onlineUsers.get(userId) || new Set();
};

module.exports = { initSocket, isUserOnline, getUserSockets, getPrivateRoom };