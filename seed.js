const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const User = require('./models/User');

dotenv.config();

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vistavoyage');
    console.log('Connected to MongoDB');

    const username = 'Vistavoyage2030';
    const password = 'Vista@2030#!';
    const email    = 'admin@vistavoyagetravel.group';

    const hashed = await bcrypt.hash(password, 10);

    const existing = await User.findOne({ username });

    if (existing) {
      await User.findOneAndUpdate(
        { username },
        { password: hashed, role: 'ADMIN', name: 'Admin', status: 'offline', email }
      );
      console.log('✅ Admin updated — username:', username);
    } else {
      await User.create({
        name: 'Admin',
        username,
        email,
        password: hashed,
        role: 'ADMIN',
        status: 'offline',
      });
      console.log('✅ Admin created — username:', username);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
};

seed();
