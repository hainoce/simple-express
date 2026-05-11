require('dotenv').config();
const express = require('express');
const { initDb } = require('./db');
const authRouter = require('./auth.router');
const customersRouter = require('./customers.router');
const productsRouter = require('./products.router');
const transactionsRouter = require('./transactions.router');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/auth', authRouter);
app.use('/customers', customersRouter);
app.use('/products', productsRouter);
app.use('/transactions', transactionsRouter);

const start = async () => {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

start();
