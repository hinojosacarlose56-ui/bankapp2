import { Request, Response } from 'express';
import pool from '../db';

export const getTransactions = async (_req: Request, res: Response) => {
  const result = await pool.query('SELECT * FROM transactions ORDER BY created_at DESC');
  res.json(result.rows);
};

export const deposit = async (req: Request, res: Response) => {
  const { account_id, amount } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, account_id]);
    const result = await client.query(
      'INSERT INTO transactions (to_account_id, amount, type) VALUES ($1, $2, $3) RETURNING *',
      [account_id, amount, 'deposit']
    );
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Deposit failed' });
  } finally {
    client.release();
  }
};

export const withdrawal = async (req: Request, res: Response) => {
  const { account_id, amount } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query('SELECT balance FROM accounts WHERE id = $1', [account_id]);
    if (account.rows[0].balance < amount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient funds' });
    }
    await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, account_id]);
    const result = await client.query(
      'INSERT INTO transactions (from_account_id, amount, type) VALUES ($1, $2, $3) RETURNING *',
      [account_id, amount, 'withdrawal']
    );
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Withdrawal failed' });
  } finally {
    client.release();
  }
};

export const transfer = async (req: Request, res: Response) => {
  const { from_account_id, to_account_id, amount } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const from = await client.query('SELECT balance FROM accounts WHERE id = $1', [from_account_id]);
    if (from.rows[0].balance < amount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient funds' });
    }
    await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, from_account_id]);
    await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, to_account_id]);
    const result = await client.query(
      'INSERT INTO transactions (from_account_id, to_account_id, amount, type) VALUES ($1, $2, $3, $4) RETURNING *',
      [from_account_id, to_account_id, amount, 'transfer']
    );
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Transfer failed' });
  } finally {
    client.release();
  }
};

export const getTransactionById = async (req: Request, res: Response) => {
  const result = await pool.query('SELECT * FROM transactions WHERE id = $1', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Transaction not found' });
  res.json(result.rows[0]);
};