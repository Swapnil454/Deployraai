import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'model'], required: true },
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

const aiSupportCaseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, default: 'AI Support Session' },
  status: { type: String, enum: ['open', 'resolved', 'closed'], default: 'open' },
  messages: [messageSchema]
}, { timestamps: true });

aiSupportCaseSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.model('AISupportCase', aiSupportCaseSchema);
