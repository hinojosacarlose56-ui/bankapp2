import { Request, Response } from 'express';
import pool from '../db';

export const getCustomers = async (_req: Request, res: Response) => {
  const result = await pool.query('SELECT * FROM customers');
  res.json(result.rows);
};

export const createCustomer = async (req: Request, res: Response) => {
  const { name, email, phone, address } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO customers (name, email, phone, address) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, email, phone, address]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

export const getCustomerById = async (req: Request, res: Response) => {
  const result = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Customer not found' });
  res.json(result.rows[0]);
};

export const updateCustomer = async (req: Request, res: Response) => {
  const { name, email, phone, address } = req.body;
  const result = await pool.query(
    'UPDATE customers SET name=$1, email=$2, phone=$3, address=$4 WHERE id=$5 RETURNING *',
    [name, email, phone, address, req.params.id]
  );
  res.json(result.rows[0]);
};

export const deleteCustomer = async (req: Request, res: Response) => {
  await pool.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
  res.json({ message: 'Customer deleted' });
};

export const getCustomerAccounts = async (req: Request, res: Response) => {
  const result = await pool.query('SELECT * FROM accounts WHERE customer_id = $1', [req.params.id]);
  res.json(result.rows);
};