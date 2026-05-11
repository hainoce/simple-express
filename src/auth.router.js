const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_TTL = '1h';
const BCRYPT_ROUNDS = 10;

// POST /auth/register — create a user.
// The very first registered user is promoted to 'admin' automatically.
router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Decide role: if no users exist yet, this one is admin.
  const countResult = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  const role = countResult.rows[0].n === 0 ? 'admin' : 'user';

  try {
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, role, created_at`,
      [email, password_hash, role]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    // Postgres unique-violation — email already taken.
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    throw err;
  }
});

// POST /auth/login — verify password and issue a JWT.
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const result = await pool.query(
    'SELECT id, password_hash, role FROM users WHERE email = $1',
    [email]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = result.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);

  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );

  return res.json({ token, role: user.role });
});

module.exports = router;
