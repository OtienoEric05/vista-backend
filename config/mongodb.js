const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('❌ MONGODB_URI is not set in .env');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS:         10000,
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    console.log(`📂 Database: ${conn.connection.name}`);
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);

    if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
      console.error('');
      console.error('💡 DNS resolution failed — the hostname in MONGODB_URI cannot be reached.');
      console.error('   This usually means one of:');
      console.error('   1. You are using an INTERNAL platform URI (Railway/Render/Docker service name)');
      console.error('      → Go to your platform dashboard and copy the PUBLIC/EXTERNAL connection string');
      console.error('   2. You are developing locally → use mongodb://127.0.0.1:27017/vistavoyage');
      console.error('   3. The database service is not running');
      console.error('');
      console.error('   Current URI host:', uri.split('@')[1]?.split('/')[0] || 'unknown');
    }

    process.exit(1);
  }
};

module.exports = connectDB;
