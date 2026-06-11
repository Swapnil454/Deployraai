import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Deployment from './src/models/Deployment.js';

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  await Deployment.updateMany(
    { status: 'running', platform: 'vercel' },
    { $set: { status: 'failed', errorMessage: 'Awaiting manual GitHub connection' } }
  );
  console.log('Updated running deployments to failed!');
  process.exit(0);
}

run();
