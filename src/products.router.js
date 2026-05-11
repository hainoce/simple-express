const express = require('express');
const { pool } = require('./db');
const { requireAuth, requireAdmin } = require('./auth.middleware');

const router = express.Router();

// GET /products — list all (non-deleted) products
router.get('/', async (_req, res) => {
  const result = await pool.query(
    'SELECT * FROM products WHERE deleted_at IS NULL ORDER BY id'
  );
  return res.json(result.rows);
});

// GET /products/:id — fetch one (non-deleted) product
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    'SELECT * FROM products WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }

  return res.json(result.rows[0]);
});

// POST /products — add a new product (any logged-in user)
router.post('/', requireAuth, async (req, res) => {
  const { product_name, stock, price } = req.body;

  if (!product_name || stock === undefined || price === undefined) {
    return res.status(400).json({
      error: 'product_name, stock, and price are required',
    });
  }

  const result = await pool.query(
    `INSERT INTO products (product_name, stock, price, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [product_name, stock, price, req.user.userId]
  );

  return res.status(201).json(result.rows[0]);
});

// DELETE /products/:id — admin-only soft delete.
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `UPDATE products
        SET deleted_at = NOW(), deleted_by = $2
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *`,
    [id, req.user.userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }

  return res.json({ deleted: result.rows[0] });
});

module.exports = router;
