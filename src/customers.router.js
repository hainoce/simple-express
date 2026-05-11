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

// DELETE /customers/:id — admin-only soft delete.
// The row stays in the table; deleted_at + deleted_by mark it as removed.
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `UPDATE customers
        SET deleted_at = NOW(), deleted_by = $2
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *`,
    [id, req.user.userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  return res.json({ deleted: result.rows[0] });
});

module.exports = router;
