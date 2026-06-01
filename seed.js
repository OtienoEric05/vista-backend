const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config({ path: 'backend/.env' });

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String },
  role: { type: String, enum: ['USER', 'ADMIN', 'MANAGER', 'AGENT', 'PARTNER'], default: 'USER' },
  status: { type: String, enum: ['online', 'working', 'away', 'offline'], default: 'offline' },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

const seed = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vistavoyage';
    
    try {
      await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
      console.log('✅ Connected to MongoDB');
    } catch (error) {
      console.log('⚠️ Atlas connection failed, trying local...');
      await mongoose.connect('mongodb://127.0.0.1:27017/vistavoyage', { serverSelectionTimeoutMS: 2000 });
      console.log('✅ Connected to local MongoDB');
    }

    const email = 'admin@vistavoyage.com';
    const existing = await User.findOne({ email });

    if (existing) {
      // Update role to ADMIN and reset password
      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash('Admin@1234', salt);
      await User.findOneAndUpdate({ email }, { password: hashed, role: 'ADMIN' });
      console.log('✅ Admin user updated successfully');
    } else {
      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash('Admin@1234', salt);
      await User.create({ name: 'Admin', email, password: hashed, role: 'ADMIN', status: 'online' });
      console.log('✅ Admin user created successfully');
    }

    console.log('');
    console.log('🔐 Login credentials:');
    console.log('   Email:    admin@vistavoyage.com');
    console.log('   Password: Admin@1234');
    console.log('');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
};

seed();
