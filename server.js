const express = require("express");
const compression = require("compression");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const path = require("path");
const connectDB = require("./config/mongodb");

const http = require("http");
const { Server } = require("socket.io");
const User = require("./models/User");

dotenv.config();

const LOCAL_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
];

const corsOrigins = [
  ...new Set([
    ...LOCAL_DEV_ORIGINS,
    ...(process.env.CORS_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ]),
];

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  },
});

const PORT = process.env.PORT || 5000;

// ---------- SOCKET.IO ----------
const connectedUsers = new Map();

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("userOnline", async (userId) => {
    connectedUsers.set(socket.id, userId);
    await User.findByIdAndUpdate(userId, { status: "online", lastActivity: new Date() });
    console.log(`👤 User ${userId} is now online`);
    io.emit("statusUpdate", { userId, status: "online" });
  });

  socket.on("disconnect", async () => {
    const userId = connectedUsers.get(socket.id);
    if (userId) {
      await User.findByIdAndUpdate(userId, { status: "offline", lastActivity: new Date() });
      console.log(`👤 User ${userId} went offline`);
      io.emit("statusUpdate", { userId, status: "offline" });
      connectedUsers.delete(socket.id);
    }
    console.log("User disconnected:", socket.id);
  });
});

// ---------- MIDDLEWARE ----------
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.url}`);
  next();
});
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (corsOrigins.includes(origin)) {
        return callback(null, origin);
      }
      callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('io', io);
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    maxAge: 24 * 60 * 60 * 1000,
    setHeaders(res) {
      res.setHeader("Cache-Control", "public, max-age=86400");
    },
  })
);

// ---------- ROUTES ----------
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "VistaVoyage API running" });
});

const adminRoutes        = require("./routes/adminRoutes");
const blogRoutes         = require("./routes/blogRoutes");
const tourRoutes         = require("./routes/tourRoutes");
const bookingRoutes      = require("./routes/bookingRoutes");
const appointmentRoutes  = require("./routes/appointmentRoutes");
const partnerRoutes      = require("./routes/partnerRoutes");
const seasonRoutes       = require("./routes/seasonRoutes");
const seasonalRateRoutes = require("./routes/seasonalRateRoutes");
const contactRoutes      = require("./routes/contactRoutes");
const messageRoutes      = require("./routes/messageRoutes");

app.use("/api/blogs",          blogRoutes);
app.use("/api/tours",          tourRoutes);
app.use("/api/bookings",       bookingRoutes);
app.use("/api/appointments",   appointmentRoutes);
app.use("/api/partners",       partnerRoutes);
app.use("/api/seasons",        seasonRoutes);
app.use("/api/seasonal-rates", seasonalRateRoutes);
app.use("/api/contact",        contactRoutes);
app.use("/api/admin",          adminRoutes);
app.use("/api/messages",       messageRoutes);

console.log('✅ All routes initialized');

// ---------- 404 HANDLER ----------
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ---------- ERROR HANDLER ----------
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: "Internal Server Error",
    error: err.message,
  });
});

// ---------- START SERVER ----------
const startServer = async () => {
  try {
    console.log('⏳ Starting server and connecting to database...');
    await connectDB();
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📡 Socket.io initialized and listening`);
      console.log(`🌐 CORS allowed origins: ${corsOrigins.join(", ")}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
