require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('../config/mongodb');
const User = require('../models/User');

async function seedAdmin() {
  await connectDB();

  const username = 'Vistavoyage2030';
  const password = 'Vista@2030#!';
  const email = 'admin@vistavoyagetravel.group';

  const existing = await User.findOne({ username });
  if (existing) {
    console.log('✅ Admin already exists');
    process.exit(0);
  }

  const hashed = await bcrypt.hash(password, 10);
  await User.create({
    username,
    email,
    password: hashed,
    name: 'Vista Admin',
    role: 'ADMIN',
    status: 'offline'
  });

  console.log('✅ Admin user created successfully');
  process.exit(0);
}

seedAdmin().catch(err => {
  console.error('❌ Error seeding admin:', err.message);
  process.exit(1);
});
