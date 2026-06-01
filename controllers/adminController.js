const Booking = require('../models/Booking');
const Tour = require('../models/Tour');
const User = require('../models/User');
const Task = require('../models/Task');
const Activity = require('../models/Activity');

// @desc    Get dashboard stats
exports.getStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const [
      totalBookings,
      pendingBookings,
      paymentsToConfirm,
      toursStartingToday,
      flightBookings,
      packageBookings,
      appointmentBookings,
      bookingsToday,
      totalTours,
      totalRevenueResult,
      staffOnline,
    ] = await Promise.all([
      Booking.countDocuments(),
      Booking.countDocuments({
        workflowStatus: { $in: ['NEW', 'PENDING_CONFIRMATION', 'ASSIGNED'] },
      }),
      Booking.countDocuments({ paymentStatus: 'PENDING' }),
      Booking.countDocuments({
        type: 'PACKAGE',
        fromDate: { $gte: today, $lt: dayEnd },
      }),
      Booking.countDocuments({ type: 'FLIGHT' }),
      Booking.countDocuments({
        $or: [{ type: 'PACKAGE' }, { type: { $exists: false } }, { type: null }],
      }),
      Booking.countDocuments({ type: 'APPOINTMENT' }),
      Booking.countDocuments({ createdAt: { $gte: today } }),
      Tour.countDocuments(),
      Booking.aggregate([
        { $match: { status: 'CONFIRMED' } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } },
      ]),
      User.countDocuments({
        role: { $in: ['ADMIN', 'MANAGER', 'AGENT'] },
        status: { $in: ['online', 'working', 'away'] },
      }),
    ]);

    const airportPickups = 6; // Mock or calculate from custom field if exists
    const activeTours = totalTours;

    const totalRevenue = totalRevenueResult[0]?.total || 0;

    console.log('📊 Dashboard Stats Calculated:', {
      totalBookings,
      flightBookings,
      packageBookings,
      appointmentBookings,
      bookingsToday,
      totalTours,
      activeTours,
      totalRevenue,
      staffOnline
    });

    res.json({
      totalBookings,
      pendingBookings,
      paymentsToConfirm,
      toursStartingToday,
      airportPickups,
      flightBookings,
      packageBookings,
      appointmentBookings,
      bookingsToday,
      totalTours,
      activeTours,
      totalRevenue,
      staffOnline
    });
  } catch (error) {
    console.error('❌ Error in getStats:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all tasks
// @route   GET /api/admin/dashboard/tasks
exports.getTasks = async (req, res) => {
  try {
    const tasks = await Task.find().populate('assignedTo', 'name email status').sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a task
// @route   POST /api/admin/dashboard/tasks
exports.createTask = async (req, res) => {
  const { title, description, assignedTo, priority, deadline, bookingId } = req.body;
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User context missing' });
    }

    const task = await Task.create({
      title,
      description,
      assignedTo,
      priority,
      deadline,
      booking: bookingId || undefined,
      createdBy: req.user._id
    });

    await Activity.create({
      staffId: req.user._id,
      action: 'Created Task',
      metadata: { taskId: task._id, taskTitle: task.title, bookingId }
    });

    // If linked to a booking, add to booking's activity timeline
    if (bookingId) {
      const Booking = require('../models/Booking');
      await Booking.findByIdAndUpdate(bookingId, {
        $push: {
          activityTimeline: {
            action: 'Task Assigned',
            details: `Task "${title}" assigned to executive`,
            performer: req.user._id
          }
        }
      });
    }

    res.status(201).json(task);
  } catch (error) {
    console.error('Task creation error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update task status
// @route   PATCH /api/admin/dashboard/tasks/:id
exports.updateTaskStatus = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User context missing' });
    }

    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );

    if (task) {
      await Activity.create({
        staffId: req.user._id,
        action: `Updated Task Status: ${req.body.status}`,
        metadata: { taskId: task._id, taskTitle: task.title }
      });
    }

    res.json(task);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get staff activity
// @route   GET /api/admin/dashboard/activity
exports.getActivity = async (req, res) => {
  try {
    const activity = await Activity.find()
      .populate('staffId', 'name role status')
      .sort({ timestamp: -1 })
      .limit(50);
    res.json(activity);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all customers
exports.getCustomers = async (req, res) => {
  try {
    const customers = await User.find({ role: 'USER' }).select('-password');
    
    // Enrich with booking counts
    const enrichedCustomers = await Promise.all(customers.map(async (customer) => {
      const bookingCount = await Booking.countDocuments({ guestEmail: customer.email });
      return {
        ...customer._doc,
        totalBookings: bookingCount
      };
    }));
    
    res.json(enrichedCustomers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all staff members
exports.getStaff = async (req, res) => {
  try {
    const staff = await User.find({ 
      role: { $in: ['ADMIN', 'MANAGER', 'AGENT'] } 
    }).select('-password');
    res.json(staff);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add new staff member
exports.addStaff = async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User context missing' });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: role || 'AGENT',
      status: 'offline'
    });

    await Activity.create({
      staffId: req.user._id,
      action: `Enlisted New Staff: ${name}`,
      metadata: { newStaffId: user._id, role: user.role }
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    });
  } catch (error) {
    console.error('Add staff error:', error);
    res.status(500).json({ message: error.message });
  }
};
