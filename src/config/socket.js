const jwt = require('jsonwebtoken');

// Socket.IO authentication middleware
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('Socket authentication error: JWT_SECRET is not set');
      return next(new Error('Server authentication misconfigured'));
    }

    // Verify JWT
    const decoded = jwt.verify(token, jwtSecret);
    
    // Extract user info
    const { id: userId, role } = decoded;

    // Attach user info to socket
    socket.userId = userId;
    socket.role = role;
    
    next();
  } catch (error) {
    console.error('Socket authentication error:', error.message);
    next(new Error('Invalid authentication token'));
  }
};

// Room management
const joinUserRooms = (socket) => {
  // Join personal user room
  socket.join(`user:${socket.userId}`);
  
  if (socket.role === 'TECHNICIAN') {
    // Join general technicians room
    socket.join('technicians');
    // Join personal technician room
    socket.join(`technician:${socket.userId}`);
    console.log(`Technician ${socket.userId} joined rooms: user:${socket.userId}, technicians, technician:${socket.userId}`);
  } else if (socket.role === 'CLIENT') {
    // Join personal client room
    socket.join(`client:${socket.userId}`);
    console.log(`Client ${socket.userId} joined rooms: user:${socket.userId}, client:${socket.userId}`);
  } else {
    console.log(`User ${socket.userId} (${socket.role}) joined room: user:${socket.userId}`);
  }
};

// Event logging
const logSocketEvents = (io) => {
  io.on('connection', (socket) => {
    console.log(`✅ Socket connected: ${socket.id} (User: ${socket.userId}, Role: ${socket.role})`);
    
    // Join rooms after successful authentication
    joinUserRooms(socket);
    
    // Emit technician presence events
    if (socket.role === 'TECHNICIAN') {
      socket.broadcast.to('technicians').emit('technician_online', {
        technicianId: socket.userId
      });
    }
    
    socket.on('disconnect', (reason) => {
      console.log(`❌ Socket disconnected: ${socket.id} (User: ${socket.userId}, Reason: ${reason})`);
      
      // Emit technician offline event
      if (socket.role === 'TECHNICIAN') {
        socket.broadcast.to('technicians').emit('technician_offline', {
          technicianId: socket.userId
        });
      }
    });
    
    // Handle socket errors
    socket.on('error', (error) => {
      console.error(`❌ Socket error for ${socket.id}:`, error.message);
    });
  });
};

module.exports = {
  authenticateSocket,
  logSocketEvents,
  joinUserRooms
};
