const mongoose     = require('mongoose');
const bcrypt       = require('bcryptjs');
const dotenv       = require('dotenv');
const User         = require('./models/User');
const Tour         = require('./models/Tour');
const defaultTours = require('./data/defaultTours');

dotenv.config();

const seed = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vistavoyage';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // ── 1. Admin User ─────────────────────────────────────────────────────────
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

    // ── 2. Sync Tours from Frontend (3 Travel Worlds) ─────────────────────────
    console.log(`\n⏳ Seeding ${defaultTours.length} frontend tours...`);
    let created = 0;
    let updated = 0;

    for (const item of defaultTours) {
      const existingTour = await Tour.findOne({
        $or: [
          { slug: item.slug },
          { title: item.title }
        ]
      });

      if (existingTour) {
        await Tour.findByIdAndUpdate(existingTour._id, item, { new: true });
        console.log(`🔄 Updated tour: [${item.travelType.toUpperCase()}] ${item.title}`);
        updated++;
      } else {
        await Tour.create(item);
        console.log(`✨ Created tour: [${item.travelType.toUpperCase()}] ${item.title}`);
        created++;
      }
    }
    console.log(`✅ Tours seeded: ${created} created, ${updated} updated`);

    await mongoose.disconnect();
    console.log('🎉 Database seeding completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
};

seed();
