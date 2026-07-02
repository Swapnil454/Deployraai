import { createRequireAuth } from '@ai-agents/shared';
import { db } from '../db.js';

export const requireAuth = createRequireAuth(db);
