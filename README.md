# simple-express

A small Express + PostgreSQL service used as a sandbox for exercising the [`@stack-kit/audit-trail`](https://www.npmjs.com/package/@stack-kit/audit-trail) library. Manages users, customers, products, and transactions, with JWT auth and admin-only deletes.

## Branches

Two variants of the same app live side by side so they can be compared:

- **`feat/hard-delete`** *(this branch — the baseline)*. JWT auth, audit columns on the data tables, and hard deletes that remove rows outright.
- **`feat/soft-delete`**. Same app, but `DELETE` endpoints flip `deleted_at` / `deleted_by` instead of removing the row. Reads filter out soft-deleted rows; references on `POST /transactions` are validated against live rows only.

In both branches, `audit_trail` is populated by triggers, but `changed_by` falls back to the Postgres role (e.g. `'postgres'`) because neither branch pushes the JWT user into the database session. That extra plumbing is intentionally out of scope here — adding it requires a small `set_config('audit.user', …, true)` helper around every write.

## Stack

- Node + Express
- PostgreSQL via `pg`
- `jsonwebtoken` + `bcrypt` for auth
- `@stack-kit/audit-trail` for trigger-based change logging

## Setup

You'll need a PostgreSQL instance you can connect to.

1. Copy the example env file and fill in your values:

   ```bash
   cp .env.example .env
   ```

   Required keys:

   ```
   PORT=3000
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=customers_db
   DB_USER=postgres
   DB_PASSWORD=...
   JWT_SECRET=...    # any long random string, e.g. `openssl rand -hex 32`
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the server. `initDb()` runs on boot and is idempotent — it creates any missing tables and adds audit columns to existing ones:

   ```bash
   npm run dev
   ```

   Look for the `Database initialized — …` log line. You should now be listening on `http://localhost:3000`.

## Wiring up audit-trail

The library is installed but not active until you create the audit table and apply triggers. After the app has booted at least once (so the tables exist):

```bash
npx audit-trail init                                       # create audit_trail table
npx audit-trail whitelist --add=customers,products,transactions
npx audit-trail sync                                       # apply triggers
npx audit-trail check                                      # verify
```

Every INSERT/UPDATE/DELETE on those three tables now writes a row to `audit_trail`.

`audit_trail.changed_by` will show the Postgres role (e.g. `'postgres'`) for every change — the JWT user identity is not pushed into the database session on either branch.

## Schema

`initDb()` creates four tables:

- **`users`** — `id`, `email` (unique), `password_hash`, `role` (`'admin'` | `'user'`), `created_at`
- **`customers`** — `id`, `customer_name`, `customer_address`, plus audit columns
- **`products`** — `id`, `product_name`, `stock`, `price`, plus audit columns
- **`transactions`** — `id`, `customer_id` (FK), `product_id` (FK), `quantity`, `total_price`, plus audit columns

Audit columns on the three data tables: `created_at`, `created_by` (FK to `users`), `updated_by` (FK to `users`), `updated_at`. A Postgres `BEFORE UPDATE` trigger bumps `updated_at` automatically on every row update; the application sets `updated_by` explicitly when it issues an UPDATE.

Foreign keys to `users` use `ON DELETE SET NULL`, so removing a user preserves history.

## API

All endpoints expect/return JSON.

### Auth

- `POST /auth/register` *(open)* — body `{ email, password }`. The **first** registered user is auto-promoted to admin; everyone else gets `role: 'user'`.
- `POST /auth/login` *(open)* — body `{ email, password }`. Returns `{ token, role }`. Tokens expire in 1 hour.

For protected endpoints, send the token as `Authorization: Bearer <token>`.

### Customers

- `POST /customers` *(any logged-in user)* — body `{ customer_name, customer_address }`.
- `DELETE /customers/:id` *(admin)* — hard delete. Returns `409` if any transaction references the customer.

### Products

- `GET /products` *(open)* — list all.
- `GET /products/:id` *(open)* — fetch one.
- `POST /products` *(any logged-in user)* — body `{ product_name, stock, price }`.
- `DELETE /products/:id` *(admin)* — hard delete. Returns `409` if any transaction references the product.

### Transactions

- `GET /transactions` *(open)* — list all.
- `POST /transactions` *(any logged-in user)* — body `{ customer_id, product_id, quantity, total_price }`.
- `DELETE /transactions/:id` *(admin)* — hard delete.

## Smoke test

A Postman collection is included at `postman_collection.json`. Import it in Postman, run **Auth → Register** (the first call creates an admin), then **Auth → Login** (the login response's test script auto-saves the token into the `{{token}}` collection variable used by every protected request).

Or with curl:

```bash
# Register the first user (becomes admin)
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"secret123"}'

# Log in and capture the token
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"secret123"}' \
  | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# Create a product
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"product_name":"Widget","stock":10,"price":9.99}'

# Delete it
curl -X DELETE http://localhost:3000/products/1 \
  -H "Authorization: Bearer $TOKEN"
```

Inspect the audit log:

```sql
SELECT id, table_name, action, changed_by, changed_at,
       old_data, new_data
FROM audit_trail
ORDER BY changed_at DESC
LIMIT 10;
```

You'll see one `INSERT` and one `DELETE` row, both attributed to `changed_by = 'postgres'`.

## File layout

```
src/
  index.js                 entry point — wires routers, runs initDb()
  db.js                    pg Pool + initDb() (tables, migrations, triggers)
  auth.middleware.js       requireAuth + requireAdmin
  auth.router.js           /auth/register + /auth/login
  customers.router.js
  products.router.js
  transactions.router.js
```

## Caveats

- `initDb()` uses `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`. It does **not** alter existing column types or drop columns — if a schema change requires that, do it manually in psql or graduate to a real migration tool.
- Tokens are short-lived (1 hour) and there is no refresh flow. Re-run `/auth/login` when yours expires.
- Errors that aren't explicitly handled (bad FK references on POST, etc.) bubble up as a 500. Fine for a POC; add a global error handler before shipping anywhere real.
