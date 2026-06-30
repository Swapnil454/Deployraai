import express from 'express';
import safeRegex from 'safe-regex';
import { requireAuth, verifyProjectOwnership } from '../middleware/auth.middleware.js';
import Project from '../models/Project.js';

const router = express.Router();

router.use(requireAuth);

router.get('/:projectId/pipelines', verifyProjectOwnership, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    res.json(project.logPipelines || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch log pipelines' });
  }
});

router.post('/:projectId/pipelines', verifyProjectOwnership, async (req, res) => {
  try {
    const { name, patternType, pattern } = req.body;
    if (!name || !patternType || !pattern) {
      return res.status(400).json({ error: 'Name, patternType, and pattern are required' });
    }
    
    // Simple syntax & ReDoS validation
    if (patternType === 'regex') {
      try {
        new RegExp(pattern);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid regular expression syntax' });
      }
      if (!safeRegex(pattern)) {
        return res.status(400).json({ error: 'Regex rejected: Pattern is vulnerable to catastrophic backtracking (ReDoS)' });
      }
    }

    const project = await Project.findById(req.params.projectId);
    
    // Prevent O(N*M) CPU Exhaustion: Limit max pipelines per project
    if (project.logPipelines && project.logPipelines.length >= 10) {
      return res.status(400).json({ error: 'Maximum of 10 log pipelines allowed per project to ensure optimal ingestion performance.' });
    }

    const newPipeline = { name, patternType, pattern, active: true };
    
    if (!project.logPipelines) {
      project.logPipelines = [];
    }
    project.logPipelines.push(newPipeline);
    
    await project.save();
    res.json(project.logPipelines);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create log pipeline' });
  }
});

router.delete('/:projectId/pipelines/:pipelineId', verifyProjectOwnership, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    project.logPipelines = project.logPipelines.filter(p => p._id.toString() !== req.params.pipelineId);
    await project.save();
    res.json({ success: true, logPipelines: project.logPipelines });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete log pipeline' });
  }
});

export default router;
