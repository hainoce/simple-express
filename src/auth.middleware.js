const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set — refusing to start');
}

// requireAuth — verifies the bearer token and attaches { userId, role } to req.user.
const requireAuth = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { userId: payload.userId, role: payload.role };
    return next();
  } catch (_err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// requireAdmin — must be used AFTER requireAuth.
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }
  return next();
};

module.exports = { requireAuth, requireAdmin };
