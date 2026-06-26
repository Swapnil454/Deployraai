import express from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  getIssues,
  getIssue,
  getIssueEvents,
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

router.get('/:projectId/issues', getIssues);
router.get('/:projectId/issues/:issueId', getIssue);
router.get('/:projectId/issues/:issueId/events', getIssueEvents);
router.get('/:projectId/issues/:issueId/comments', getIssueComments);
router.post('/:projectId/issues/:issueId/comments', createIssueComment);
router.patch('/:projectId/issues/:issueId/ignore', ignoreIssue);
router.patch('/:projectId/issues/:issueId/resolve', resolveIssue);
router.post('/:projectId/issues/:issueId/diagnose', diagnoseIssue);
router.get('/:projectId/issues/:issueId/diagnose', getIssueDiagnosis);
router.post('/:projectId/issues/:issueId/create-pr', createIssueFixPr);

export default router;
