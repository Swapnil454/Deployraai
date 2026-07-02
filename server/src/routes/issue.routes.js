import express from 'express';
import { requireAuth, verifyProjectOwnership } from '../middleware/auth.middleware.js';
import {
  getIssues,
  getIssue,
  getIssueComments,
  createIssueComment,
  ignoreIssue,
  resolveIssue,
  diagnoseIssue,
  getIssueDiagnosis
} from '../controllers/issue.controller.js';
import { createIssueFixPr } from '../controllers/issueFix.controller.js';

const router = express.Router();

router.use(requireAuth);

router.get('/:projectId/issues', verifyProjectOwnership, getIssues);
router.get('/:projectId/issues/:issueId', verifyProjectOwnership, getIssue);
router.get('/:projectId/issues/:issueId/comments', verifyProjectOwnership, getIssueComments);
router.post('/:projectId/issues/:issueId/comments', verifyProjectOwnership, createIssueComment);
router.patch('/:projectId/issues/:issueId/ignore', verifyProjectOwnership, ignoreIssue);
router.patch('/:projectId/issues/:issueId/resolve', verifyProjectOwnership, resolveIssue);
router.post('/:projectId/issues/:issueId/diagnose', verifyProjectOwnership, diagnoseIssue);
router.get('/:projectId/issues/:issueId/diagnose', verifyProjectOwnership, getIssueDiagnosis);
router.post('/:projectId/issues/:issueId/create-pr', verifyProjectOwnership, createIssueFixPr);

export default router;
