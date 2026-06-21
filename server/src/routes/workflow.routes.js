import express from "express";
import mongoose from "mongoose";
import { triggerWorkflow } from "../services/workflow.service.js";
import WorkflowRun from "../models/WorkflowRun.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router({ mergeParams: true });

// Get all workflows for a project (with filtering and counts)
router.get("/", requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status = 'all', search = '' } = req.query;

    // 1. Get accurate counts for all statuses
    const allRuns = await WorkflowRun.find({ projectId }, 'status');
    const counts = {
      all: allRuns.length,
      completed: allRuns.filter(r => r.status === 'completed').length,
      running: allRuns.filter(r => ['running', 'sleeping', 'failed_retrying'].includes(r.status)).length,
      failed: allRuns.filter(r => r.status === 'failed').length,
      cancelled: allRuns.filter(r => r.status === 'cancelled').length
    };

    // 2. Build filter query for actual runs
    const filterQuery = { projectId };
    
    if (status && status !== 'all') {
      if (status === 'running') {
        filterQuery.status = { $in: ['running', 'sleeping', 'failed_retrying'] };
      } else {
        filterQuery.status = status;
      }
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      if (mongoose.Types.ObjectId.isValid(search) && search.length === 24) {
        filterQuery.$or = [
          { workflowName: searchRegex },
          { _id: search }
        ];
      } else {
        filterQuery.workflowName = searchRegex;
      }
    }

    const runs = await WorkflowRun.find(filterQuery).sort({ createdAt: -1 }).limit(50);
    res.json({ counts, runs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger a new workflow
router.post("/:name/trigger", requireAuth, async (req, res) => {
  try {
    const { projectId, name } = req.params;
    const payload = req.body;
    
    // We don't await the trigger! It runs in the background.
    // We just start it and return the Run ID.
    const run = await WorkflowRun.create({
      projectId,
      workflowName: name,
      payload,
    });

    triggerWorkflow(projectId, name, payload, run._id).catch(err => {
      console.error(`[Workflow:Trigger] Uncaught error:`, err);
    });

    res.json({ success: true, runId: run._id, message: "Workflow triggered successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel a workflow
router.post("/:runId/cancel", requireAuth, async (req, res) => {
  try {
    const { projectId, runId } = req.params;
    const run = await WorkflowRun.findOne({ _id: runId, projectId });
    if (!run) return res.status(404).json({ error: "Run not found" });

    if (run.status === 'completed' || run.status === 'failed') {
      return res.status(400).json({ error: `Cannot cancel a workflow that is already ${run.status}` });
    }

    run.status = 'cancelled';
    run.lockedAt = null;
    run.cancelledAt = new Date();
    if (req.user && req.user.userId) run.cancelledBy = req.user.userId;
    await run.save();

    res.json({ success: true, runId: run._id, message: "Workflow cancelled successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Retry a failed workflow
router.post("/:runId/retry", requireAuth, async (req, res) => {
  try {
    const { projectId, runId } = req.params;
    const run = await WorkflowRun.findOne({ _id: runId, projectId });
    if (!run) return res.status(404).json({ error: "Run not found" });

    if (run.status !== 'failed') {
      return res.status(400).json({ error: "Only failed workflows can be manually retried." });
    }

    // Reset the failed step's attempts so it can start fresh
    if (run.failedStep && run.ledger[run.failedStep]) {
      const failedStepName = run.failedStep;
      run.ledger[failedStepName].attempts = 0;
      run.ledger[failedStepName].status = 'failed_retrying';
      
      // We should clear the `failedStep` and `errorMessage` from the main run
      run.failedStep = null;
      run.errorMessage = null;
      run.lastErrorCode = null;
      run.error = null;
      run.status = 'running';
      
      await WorkflowRun.updateOne(
        { _id: run._id },
        { 
          $set: { 
            [`ledger.${failedStepName}.attempts`]: 0,
            [`ledger.${failedStepName}.status`]: 'failed_retrying',
            status: 'running',
            retriedAt: new Date(),
            ...(req.user && req.user.userId ? { retriedBy: req.user.userId } : {})
          },
          $inc: { retryCount: 1 },
          $unset: {
            failedStep: "",
            errorMessage: "",
            lastErrorCode: "",
            error: ""
          }
        }
      );
    } else {
      // If we don't know the failed step, just set to running
      run.status = 'running';
      run.error = null;
      run.retriedAt = new Date();
      if (req.user && req.user.userId) run.retriedBy = req.user.userId;
      run.retryCount = (run.retryCount || 0) + 1;
      await run.save();
    }

    // Trigger it!
    triggerWorkflow(projectId, run.workflowName, run.payload, run._id).catch(err => {
      console.error(`[Workflow:Retry] Error retrying workflow ${run._id}:`, err);
    });

    res.json({ success: true, runId: run._id, message: "Workflow retry initiated." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
