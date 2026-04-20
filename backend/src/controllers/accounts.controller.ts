import { Request, Response } from 'express';
import pool from '../db';

export const getAccounts = async (_req: Request, res: Response) => {
  const result = await pool.query('SELECT * FROM accounts');
  res.json(result.rows);
};

export const createAccount = async (req: Request, res: Response) => {
  const { customer_id, type, balance } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO accounts (customer_id, type, balance) VALUES ($1, $2, $3) RETURNING *',
      [customer_id, type, balance ?? 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

export const getAccountById = async (req: Request, res: Response) => {
  const result = await pool.query('SELECT * FROM accounts WHERE id = $1', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Account not found' });
  res.json(result.rows[0]);
};

export const updateAccount = async (req: Request, res: Response) => {
  const { type, balance } = req.body;
  const result = await pool.query(
    'UPDATE accounts SET type=$1, balance=$2 WHERE id=$3 RETURNING *',
    [type, balance, req.params.id]
  );
  res.json(result.rows[0]);
};

export const getAccountTransactions = async (req: Request, res: Response) => {
  const result = await pool.query(
    'SELECT * FROM transactions WHERE from_account_id = $1 OR to_account_id = $1 ORDER BY created_at DESC',
    [req.params.id]
  );
  res.json(result.rows);
};