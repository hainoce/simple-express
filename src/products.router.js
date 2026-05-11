const express = require('express');
const { pool } = require('./db');
const { requireAuth, requireAdmin } = require('./auth.middleware');

const router = express.Router();

// GET /products — list all products
router.get('/', async (_req, res) => {
  const result = await pool.query('SELECT * FROM products ORDER BY id');
  return res.json(result.rows);
});

// GET /products/:id — fetch one product
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);

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

// DELETE /products/:id — admin-only
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM products WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.json({ deleted: result.rows[0] });
  } catch (err) {
    // Postgres FK violation — product is referenced by transactions.
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'Cannot delete product — it appears in existing transactions',
      });
    }
    throw err;
  }
});

module.exports = router;
