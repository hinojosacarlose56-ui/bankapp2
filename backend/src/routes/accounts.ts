import { Router } from 'express';
import { getAccounts, createAccount, getAccountById, updateAccount, getAccountTransactions } from '../controllers/accounts.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.get('/', getAccounts);
router.post('/', createAccount);
router.get('/:id', getAccountById);
router.put('/:id', updateAccount);
router.get('/:id/transactions', getAccountTransactions);

export default router;