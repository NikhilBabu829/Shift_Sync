// Module-level singleton — holds the Socket.io server instance after init() is called
let io;

module.exports = {
    // Initialises Socket.io on the provided HTTP server; must be called once at startup
    init: (httpServer) => {
        io = require('socket.io')(httpServer, {
            cors: {
                // Allow WebSocket connections from the same origin as the REST API
                origin: process.env.FRONTEND_URL || "http://localhost:5173",
                methods: ["GET", "POST"],
                credentials: true
            }
        });
        return io;
    },
    // Returns the existing Socket.io instance; throws if init() has not been called yet
    getIO: () => {
        if (!io) {
            throw new Error("Socket.io not initialized!");
        }
        return io;
    }
};
