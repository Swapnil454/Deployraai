import mongoose from "mongoose";

const analyticsEventSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },

    trackingId: {
      type: String,
      required: true,
      index: true,
    },

    eventType: {
      type: String,
      enum: ["page_view", "custom"],
      required: true,
      index: true,
    },

    eventName: {
      type: String,
      default: null,
      index: true,
    },

    visitorHash: {
      type: String,
      required: true,
      index: true,
    },

    sessionId: {
      type: String,
      default: null,
      index: true,
    },

    path: {
      type: String,
      required: true,
      index: true,
    },

    fullUrl: String,
    hostname: String,
    referrer: String,

    environment: {
      type: String,
      enum: ["production", "preview", "development", "unknown"],
      default: "unknown",
      index: true,
    },

    country: String,
    region: String,
    city: String,

    browser: String,
    os: String,
    device: String,

    metadata: {
      type: Object,
      default: {},
    },

    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

analyticsEventSchema.index({ projectId: 1, timestamp: -1 });
analyticsEventSchema.index({ projectId: 1, eventType: 1, timestamp: -1 });
analyticsEventSchema.index({ projectId: 1, visitorHash: 1, timestamp: -1 });

export default mongoose.model("AnalyticsEvent", analyticsEventSchema);
