const mongoose = require("mongoose");

const connectDB = async () => {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/vistavoyage";
  
  try {
    const conn = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📂 Using Database: ${conn.connection.name}`);
    return true;
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    
    // If Atlas fails, try local fallback
    if (MONGODB_URI.includes("mongodb+srv")) {
      console.log("⚠️ Attempting to connect to local MongoDB fallback...");
      try {
        const localConn = await mongoose.connect("mongodb://127.0.0.1:27017/vistavoyage", {
          serverSelectionTimeoutMS: 2000,
        });
        console.log(`✅ Connected to local MongoDB: ${localConn.connection.host}`);
        console.log(`📂 Using Local Database: ${localConn.connection.name}`);
        return true;
      } catch (localError) {
        console.error("❌ Local MongoDB fallback also failed:", localError.message);
        console.error("‼️ NO DATABASE CONNECTION - Data will NOT be saved!");
        return false;
      }
    }
    return false;
  }
};

module.exports = connectDB;
