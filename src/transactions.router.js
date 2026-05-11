const express = require('express');
const { pool } = require('./db');
const { requireAuth, requireAdmin } = require('./auth.middleware');

const router = express.Router();

// GET /transactions — list all transactions
router.get('/', async (_req, res) => {
  const result = await pool.query('SELECT * FROM transactions ORDER BY id');
  return res.json(result.rows);
});

// POST /transactions — record a transaction (any logged-in user)
router.post('/', requireAuth, async (req, res) => {
  const { customer_id, product_id, quantity, total_price } = req.body;

  if (!customer_id || !product_id || !quantity || total_price === undefined) {
    return res.status(400).json({
      error: 'customer_id, product_id, quantity, and total_price are required',
    });
  }

  const result = await pool.query(
    `INSERT INTO transactions
       (customer_id, product_id, quantity, total_price, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [customer_id, product_id, quantity, total_price, req.user.userId]
  );

  return res.status(201).json(result.rows[0]);
});

// DELETE /transactions/:id — admin-only
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    'DELETE FROM transactions WHERE id = $1 RETURNING *',
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  return res.json({ deleted: result.rows[0] });
});

module.exports = router;
