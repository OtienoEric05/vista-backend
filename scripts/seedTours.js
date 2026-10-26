const mongoose     = require('mongoose');
const dotenv       = require('dotenv');
const Tour         = require('../models/Tour');
const defaultTours = require('../data/defaultTours');

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vistavoyage';

async function seedTours() {
  try {
    console.log('Connecting to MongoDB:', MONGO_URI.replace(/:([^:@]+)@/, ':****@'));
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log(`⏳ Seeding ${defaultTours.length} tours from frontend (3 Travel Worlds)...`);

    let created = 0;
    let updated = 0;

    for (const item of defaultTours) {
      const existing = await Tour.findOne({
        $or: [
          { slug: item.slug },
          { title: item.title }
        ]
      });

      if (existing) {
        await Tour.findByIdAndUpdate(existing._id, item, { new: true });
        console.log(`🔄 Updated: [${item.travelType.toUpperCase()}] ${item.title} (${item.duration}) - $${item.price}`);
        updated++;
      } else {
        await Tour.create(item);
        console.log(`✨ Created: [${item.travelType.toUpperCase()}] ${item.title} (${item.duration}) - $${item.price}`);
        created++;
      }
    }

    console.log(`\n🎉 Tours sync complete: ${created} created, ${updated} updated.`);
    const count = await Tour.countDocuments();
    console.log(`📊 Total tours in database: ${count}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to seed tours:', err.message);
    process.exit(1);
  }
}

seedTours();
