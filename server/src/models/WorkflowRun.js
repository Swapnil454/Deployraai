import mongoose from "mongoose";

const workflowRunSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    workflowName: {
      type: String,
      required: true,
      index: true,
    },
    workflowVersion: {
      type: Number,
      required: true,
      default: 1,
    },
    status: {
      type: String,
      enum: ["running", "sleeping", "completed", "failed", "cancelled"],
      default: "running",
      index: true,
    },
    payload: {
      type: Object,
      default: {},
    },
    ledger: {
      type: Object,
      default: {}, // Maps stepName -> { status, result, error, attempts, maxRetries, nextRetryAt, etc }
    },
    events: {
      type: Array,
      default: [], // [{ stepName, status, timestamp, attempts, error, resumeAt, label }]
    },
    resumeAt: {
      type: Date,
      index: true,
    },
    lockedAt: {
      type: Date,
      index: true,
      default: null,
    },
    lockOwner: {
      type: String,
      default: null,
    },
    failedStep: {
      type: String,
    },
    errorMessage: {
      type: String,
    },
    lastErrorCode: {
      type: String,
    },
    error: {
      type: String,
    },
    cancelledAt: {
      type: Date,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    retriedAt: {
      type: Date,
    },
    retriedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    retryCount: {
      type: Number,
      default: 0,
    }
  },
  { timestamps: true }
);

workflowRunSchema.index({ status: 1, resumeAt: 1 });
workflowRunSchema.index({ projectId: 1, createdAt: -1 });

export default mongoose.model("WorkflowRun", workflowRunSchema);
