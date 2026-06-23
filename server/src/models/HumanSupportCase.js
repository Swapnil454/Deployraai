import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'admin', 'model', 'system'], required: true },
  content: { type: String, required: true },
  attachment: {
    url: String,
    type: { type: String, enum: ['image', 'file'] },
    name: String
  },
  attachments: [{
    url: String,
    type: { type: String, enum: ['image', 'file'] },
    name: String
  }],
  timestamp: { type: Date, default: Date.now }
});

const humanSupportCaseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  issueType: { type: String },
  description: { type: String },
  title: { type: String, default: 'New Support Case' },
  status: { type: String, enum: ['open', 'in-progress', 'resolved', 'closed'], default: 'open' },
  closedByRole: { type: String, enum: ['user', 'admin'] },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  messages: [messageSchema],
  parentCaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'HumanSupportCase', default: null }
}, { timestamps: true });

export default mongoose.model('HumanSupportCase', humanSupportCaseSchema);
