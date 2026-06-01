/**
 * Run against a live DB to confirm indexes are used on hot queries.
 * Usage: node scripts/verify-indexes.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/mongodb');
const Booking = require('../models/Booking');
const Tour = require('../models/Tour');

async function explainBookingWorkflowSort() {
  const exp = await Booking.find({ workflowStatus: 'NEW' })
    .sort({ createdAt: -1 })
    .limit(5)
    .explain('executionStats');
  const ix = exp.executionStats?.executionStages?.inputStage?.indexName
    || exp.queryPlanner?.winningPlan?.inputStage?.indexName
    || '(collection scan or compound)';
  console.log('Booking workflow+sort:', ix, `${exp.executionStats?.executionTimeMillis ?? '?'}ms`);
}

async function explainTourCreated() {
  const exp = await Tour.find().sort({ createdAt: -1 }).limit(10).explain('executionStats');
  const ix = exp.executionStats?.executionStages?.inputStage?.indexName
    || exp.queryPlanner?.winningPlan?.inputStage?.indexName
    || '(collection scan or compound)';
  console.log('Tour sort createdAt:', ix, `${exp.executionStats?.executionTimeMillis ?? '?'}ms`);
}

(async () => {
  await connectDB();
  await explainBookingWorkflowSort();
  await explainTourCreated();
  await mongoose.connection.close();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
