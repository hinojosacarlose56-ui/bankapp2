import { Router } from 'express';
import { getTransactions, deposit, withdrawal, transfer, getTransactionById } from '../controllers/transactions.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.get('/', getTransactions);
router.post('/deposit', deposit);
router.post('/withdrawal', withdrawal);
router.post('/transfer', transfer);
router.get('/:id', getTransactionById);

export default router;