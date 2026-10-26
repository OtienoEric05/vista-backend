const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'vv_fallback_secret';

// Verify token and attach user to req
const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorised — no token' });
  }
  try {
    req.user = jwt.verify(header.split(' ')[1], SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Not authorised — invalid token' });
  }
};

// Role-based access control
const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden — insufficient permissions' });
  }
  next();
};

// Alias used by adminRoutes
const protect = authenticate;

module.exports = { authenticate, authorize, protect };
