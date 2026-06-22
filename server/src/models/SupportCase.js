import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'model'], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const supportCaseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, default: 'New Support Case' },
  status: { type: String, enum: ['open', 'in-progress', 'resolved', 'closed'], default: 'open' },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  messages: [messageSchema]
}, { timestamps: true });

export default mongoose.model('SupportCase', supportCaseSchema);
