const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  if (process.env.NODE_ENV === 'development' && process.env.BYPASS_AUTH === 'true') {
    const mockUser = await User.findOne({ role: 'ADMIN' }).select('-password');
    req.user = mockUser || { _id: 'bypass', role: 'ADMIN', name: 'Dev Admin' };
    return next();
  }

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select('-password');

      return next();
    } catch (error) {
      console.error(error);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

const admin = (req, res, next) => {
  if (req.user && (req.user.role === 'ADMIN' || req.user.role === 'MANAGER' || req.user.role === 'AGENT')) {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as staff' });
  }
};

module.exports = { protect, admin };
