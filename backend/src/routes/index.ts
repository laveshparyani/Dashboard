import { Router } from 'express';
import authRoutes from './auth';
import tableRoutes from './tables';
import userRoutes from './users';

const router = Router();

router.use('/auth', authRoutes);
router.use('/tables', tableRoutes);
router.use('/users', userRoutes);

export default router; 