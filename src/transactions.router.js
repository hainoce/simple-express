const express = require('express');
const { pool } = require('./db');
const { requireAuth, requireAdmin } = require('./auth.middleware');

const router = express.Router();

// GET /transactions — list all (non-deleted) transactions
router.get('/', async (_req, res) => {
  const result = await pool.query(
    'SELECT * FROM transactions WHERE deleted_at IS NULL ORDER BY id'
  );
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

  // The FK constraint accepts any existing row, including soft-deleted ones.
  // Re-check that both referenced rows are still alive.
  const refsCheck = await pool.query(
    `SELECT
       (SELECT 1 FROM customers WHERE id = $1 AND deleted_at IS NULL) AS customer_ok,
       (SELECT 1 FROM products  WHERE id = $2 AND deleted_at IS NULL) AS product_ok`,
    [customer_id, product_id]
  );
  if (!refsCheck.rows[0].customer_ok) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  if (!refsCheck.rows[0].product_ok) {
    return res.status(404).json({ error: 'Product not found' });
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

// DELETE /transactions/:id — admin-only soft delete.
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `UPDATE transactions
        SET deleted_at = NOW(), deleted_by = $2
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *`,
    [id, req.user.userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  return res.json({ deleted: result.rows[0] });
});

module.exports = router;
