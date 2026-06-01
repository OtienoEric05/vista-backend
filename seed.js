const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');

dotenv.config();

const seed = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vistavoyage';

    try {
      await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
      console.log('Connected to MongoDB');
    } catch (error) {
      console.log('Atlas connection failed, trying local...');
      await mongoose.connect('mongodb://127.0.0.1:27017/vistavoyage', { serverSelectionTimeoutMS: 2000 });
      console.log('Connected to local MongoDB');
    }

    const email = 'admin@vistavoyage.com';
    const existing = await User.findOne({ email });

    if (existing) {
      await User.findOneAndUpdate({ email }, { role: 'ADMIN', name: 'Admin', status: 'online' });
      console.log('Admin user updated:', email);
    } else {
      await User.create({ name: 'Admin', email, role: 'ADMIN', status: 'online' });
      console.log('Admin user created:', email);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
};

seed();
