const express = require('express');
const { pool } = require('./db');
const { requireAuth, requireAdmin } = require('./auth.middleware');

const router = express.Router();

// POST /customers — add a new customer (any logged-in user)
router.post('/', requireAuth, async (req, res) => {
  const { customer_name, customer_address } = req.body;

  if (!customer_name || !customer_address) {
    return res.status(400).json({
      error: 'Both customer_name and customer_address are required',
    });
  }

  const result = await pool.query(
    `INSERT INTO customers (customer_name, customer_address, created_by)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [customer_name, customer_address, req.user.userId]
  );

  return res.status(201).json(result.rows[0]);
});

// DELETE /customers/:id — admin-only
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM customers WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    return res.json({ deleted: result.rows[0] });
  } catch (err) {
    // Postgres FK violation — customer has transactions referencing them.
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'Cannot delete customer — they have existing transactions',
      });
    }
    throw err;
  }
});

module.exports = router;
