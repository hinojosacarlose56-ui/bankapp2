import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db';

export const getUsers = async (_req: Request, res: Response) => {
  const result = await pool.query('SELECT id, name, email, role, created_at FROM users');
  res.json(result.rows);
};

export const createUser = async (req: Request, res: Response) => {
  const { name, email, password, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name, email, hash, role]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json(result.rows[0]);
};

export const updateUser = async (req: Request, res: Response) => {
  const { name, email, role } = req.body;
  const result = await pool.query(
    'UPDATE users SET name=$1, email=$2, role=$3 WHERE id=$4 RETURNING id, name, email, role',
    [name, email, role, req.params.id]
  );
  res.json(result.rows[0]);
};

export const deleteUser = async (req: Request, res: Response) => {
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ message: 'User deleted' });
};

