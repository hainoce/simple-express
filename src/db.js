const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'user'
        CHECK (role IN ('admin', 'user')),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      customer_name VARCHAR(255) NOT NULL,
      customer_address TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      product_name VARCHAR(255) NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      price NUMERIC(10, 2) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL DEFAULT 1,
      total_price NUMERIC(10, 2) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── Audit columns migration ─────────────────────────────────────
  // Add created_by, updated_by, updated_at to data tables.
  // ON DELETE SET NULL so removing a user preserves history.
  // Idempotent: safe to run on every boot.
  const auditedTables = ['customers', 'products', 'transactions'];
  for (const table of auditedTables) {
    await pool.query(
      `ALTER TABLE ${table}
         ADD COLUMN IF NOT EXISTS created_by INTEGER
           REFERENCES users(id) ON DELETE SET NULL`
    );
    await pool.query(
      `ALTER TABLE ${table}
         ADD COLUMN IF NOT EXISTS updated_by INTEGER
           REFERENCES users(id) ON DELETE SET NULL`
    );
    await pool.query(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`
    );
    await pool.query(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`
    );
    await pool.query(
      `ALTER TABLE ${table}
         ADD COLUMN IF NOT EXISTS deleted_by INTEGER
           REFERENCES users(id) ON DELETE SET NULL`
    );
  }

  // ── updated_at trigger ──────────────────────────────────────────
  // A single shared trigger function bumps updated_at on every UPDATE.
  // updated_by is set explicitly by the route handler — the DB has no
  // way to know which API caller made the change.
  await pool.query(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  for (const table of auditedTables) {
    // Drop-then-create so the trigger definition stays in sync
    // if we ever change it.
    await pool.query(
      `DROP TRIGGER IF EXISTS trg_${table}_updated_at ON ${table}`
    );
    await pool.query(
      `CREATE TRIGGER trg_${table}_updated_at
         BEFORE UPDATE ON ${table}
         FOR EACH ROW
         EXECUTE FUNCTION set_updated_at()`
    );
  }

  console.log(
    'Database initialized — users, customers, products, transactions tables ready (with audit columns + updated_at triggers)'
  );
};

module.exports = { pool, initDb };
