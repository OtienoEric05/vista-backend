const Booking  = require('../models/Booking');
const Tour     = require('../models/Tour');
const User     = require('../models/User');
const Task     = require('../models/Task');
const Activity = require('../models/Activity');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');

const signToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET || 'vv_fallback_secret',
    { expiresIn: '12h' }
  );

// ─── Admin Login ──────────────────────────────────────────────────────────────
exports.adminLogin = async (req, res) => {
  const { username, email, password } = req.body;
  try {
    // Find by username OR email — case-insensitive
    const safeUsername = username ? String(username).trim() : null;
    const safeEmail    = email    ? String(email).trim().toLowerCase() : null;

    const user = await User.findOne(
      safeUsername
        ? { username: { $regex: new RegExp(`^${safeUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }
        : { email: safeEmail }
    );

    // Always run bcrypt to prevent timing attacks
    const DUMMY = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
    const hash  = user?.password || DUMMY;
    const ok    = await bcrypt.compare(String(password), hash);

    if (!user || !ok || !['ADMIN', 'MANAGER', 'AGENT'].includes(user.role)) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Extra guard: if user has no password hash stored, deny
    if (!user.password) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    Activity.create({ action: `Login: ${user.name || user.username}`, metadata: { userId: user._id } }).catch(() => {});

    res.json({
      token:    signToken(user),
      _id:      user._id,
      name:     user.name,
      username: user.username,
      email:    user.email,
      role:     user.role,
      // nested user object for frontend compatibility
      user: {
        _id:      user._id,
        name:     user.name,
        username: user.username,
        email:    user.email,
        role:     user.role,
      },
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ─── Stats ────────────────────────────────────────────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const today      = new Date(); today.setHours(0, 0, 0, 0);
    const dayEnd     = new Date(today.getTime() + 86400000);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      totalBookings, pendingBookings, toursStartingToday,
      flightBookings, packageBookings, appointmentBookings,
      bookingsToday, totalTours, totalRevenueResult,
      todayRevenueResult, monthlyRevenueResult,
      activeClientsResult, staffOnline,
    ] = await Promise.all([
      Booking.countDocuments(),
      Booking.countDocuments({ workflowStatus: { $in: ['NEW', 'PENDING_CONFIRMATION', 'ASSIGNED'] } }),
      Booking.countDocuments({ type: 'PACKAGE', fromDate: { $gte: today, $lt: dayEnd } }),
      Booking.countDocuments({ type: 'FLIGHT' }),
      Booking.countDocuments({ $or: [{ type: 'PACKAGE' }, { type: { $exists: false } }, { type: null }] }),
      Booking.countDocuments({ type: 'APPOINTMENT' }),
      Booking.countDocuments({ createdAt: { $gte: today } }),
      Tour.countDocuments(),
      Booking.aggregate([{ $match: { totalPrice: { $gt: 0 } } }, { $group: { _id: null, total: { $sum: '$totalPrice' } } }]),
      Booking.aggregate([{ $match: { createdAt: { $gte: today, $lt: dayEnd }, totalPrice: { $gt: 0 } } }, { $group: { _id: null, total: { $sum: '$totalPrice' } } }]),
      Booking.aggregate([{ $match: { createdAt: { $gte: monthStart }, totalPrice: { $gt: 0 } } }, { $group: { _id: null, total: { $sum: '$totalPrice' } } }]),
      Booking.distinct('guestEmail'),
      User.countDocuments({ role: { $in: ['ADMIN', 'MANAGER', 'AGENT'] }, status: { $in: ['online', 'working', 'away'] } }),
    ]);

    res.json({
      totalBookings, pendingBookings, toursStartingToday,
      flightBookings, packageBookings, appointmentBookings,
      bookingsToday, totalTours, activeTours: totalTours,
      totalRevenue:   totalRevenueResult[0]?.total   || 0,
      todayRevenue:   todayRevenueResult[0]?.total   || 0,
      monthlyRevenue: monthlyRevenueResult[0]?.total || 0,
      activeClients:  activeClientsResult.length,
      staffOnline,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ─── Tasks ────────────────────────────────────────────────────────────────────
exports.getTasks = async (req, res) => {
  try {
    const tasks = await Task.find().populate('assignedTo', 'name email status').sort({ createdAt: -1 });
    res.json(tasks);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.createTask = async (req, res) => {
  const { title, description, assignedTo, priority, deadline, bookingId } = req.body;
  try {
    const task = await Task.create({ title, description, assignedTo, priority, deadline, booking: bookingId || undefined });
    await Activity.create({ action: 'Created Task', metadata: { taskId: task._id, taskTitle: task.title, bookingId } });
    if (bookingId) {
      await Booking.findByIdAndUpdate(bookingId, { $push: { activityTimeline: { action: 'Task Assigned', details: `Task "${title}" assigned` } } });
    }
    res.status(201).json(task);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.updateTaskStatus = async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (task) await Activity.create({ action: `Updated Task Status: ${req.body.status}`, metadata: { taskId: task._id } });
    res.json(task);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ─── Activity ─────────────────────────────────────────────────────────────────
exports.getActivity = async (req, res) => {
  try {
    const activity = await Activity.find().populate('staffId', 'name role status').sort({ timestamp: -1 }).limit(50);
    res.json(activity);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ─── Staff ────────────────────────────────────────────────────────────────────
exports.getStaff = async (req, res) => {
  try {
    const staff = await User.find({ role: { $in: ['ADMIN', 'MANAGER', 'AGENT'] } }).select('-password');
    res.json(staff);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.addStaff = async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    if (await User.findOne({ email })) return res.status(400).json({ message: 'User already exists' });
    const salt = await bcrypt.genSalt(10);
    const user = await User.create({ name, email, role: role || 'AGENT', status: 'offline', password: await bcrypt.hash(password, salt) });
    await Activity.create({ action: `Enlisted New Staff: ${name}`, metadata: { newStaffId: user._id, role: user.role } });
    res.status(201).json({ _id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ─── Customers ────────────────────────────────────────────────────────────────
exports.getCustomers = async (req, res) => {
  try {
    const customers = await User.find({ role: 'USER' }).select('-password');
    const enriched  = await Promise.all(customers.map(async (c) => ({
      ...c._doc,
      totalBookings: await Booking.countDocuments({ guestEmail: c.email }),
    })));
    res.json(enriched);
  } catch (e) { res.status(500).json({ message: e.message }); }
};
