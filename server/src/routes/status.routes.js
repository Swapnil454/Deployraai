import express from 'express';
import { getPublicStatus, getUptimeHistory } from '../controllers/status.controller.js';

const router = express.Router();

router.get('/:identifier', getPublicStatus);
router.get('/:identifier/history', getUptimeHistory);

export default router;
