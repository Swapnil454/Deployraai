import express from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Deployment from "../models/Deployment.js";
import HumanSupportCase from "../models/HumanSupportCase.js";
import AISupportCase from "../models/AISupportCase.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

// Upload file to Cloudinary
router.post("/upload", requireAuth, upload.single('file'), async (req, res) => {
  try {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    
    const isImage = req.file.mimetype.startsWith('image/');
    const resourceType = isImage ? 'image' : 'raw';
    
    const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'support_attachments', resource_type: resourceType },
        (error, result) => {
            if (error) {
                console.error("Cloudinary upload error:", error);
                return res.status(500).json({ error: "Upload failed" });
            }
            res.json({
                url: result.secure_url,
                type: isImage ? 'image' : 'file',
                name: req.file.originalname
            });
        }
    );
    uploadStream.end(req.file.buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server upload error" });
  }
});


// Get all human cases for a user
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user._id;
    const cases = await HumanSupportCase.find({ userId }).sort({ updatedAt: -1 });
    // Make sure we inject caseType for UI consistency
    const formattedCases = cases.map(c => ({ ...c.toObject(), caseType: 'human' }));
    res.json(formattedCases);
  } catch (error) {
    console.error("Fetch cases error:", error);
    res.status(500).json({ error: "Failed to fetch support cases." });
  }
});

// Get a specific case (allow admin)
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user._id;
    let supportCase = await HumanSupportCase.findById(req.params.id).populate('userId', 'name githubUsername avatar');
    let type = 'human';

    if (!supportCase) {
      supportCase = await AISupportCase.findById(req.params.id).populate('userId', 'name githubUsername avatar');
      type = 'ai';
    }
    
    if (!supportCase) {
      return res.status(404).json({ error: "Case not found" });
    }

    const caseUserId = supportCase.userId && supportCase.userId._id ? supportCase.userId._id.toString() : supportCase.userId?.toString();
    if (caseUserId !== userId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Unauthorized access to this case." });
    }
    res.json({ ...supportCase.toObject(), caseType: type, isAdmin: req.user.role === 'admin' });
  } catch (error) {
    console.error("Fetch case error:", error);
    res.status(500).json({ error: "Failed to fetch support case." });
  }
});

// Create a new case
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user._id;
    const { title, severity, caseType, issueType, description } = req.body;

    const type = caseType || 'ai';

    let newCase;

    if (type === 'ai') {
      newCase = new AISupportCase({
        userId,
        title: title || "AI Support Session",
        messages: [
          {
            role: "model",
            content: "Hello! I am your AI Support Assistant. I have context about your projects and recent deployments. How can I help you today?"
          }
        ]
      });
    } else {
      newCase = new HumanSupportCase({
        userId,
        title: title || "New Support Case",
        severity: severity || "medium",
        issueType: issueType || '',
        description: description || '',
        messages: [
          {
            role: "user",
            content: `**Problem Area**\n${issueType || 'General Enquiry'}\n\n**Severity Level**\n${severity || 'Medium'}\n\n**Subject**\n${title || 'Summarize your issue...'}\n\n**Description**\n${description || 'Description from user side'}`
          }
        ]
      });
    }

    await newCase.save();
    
    const io = req.app.get('io');
    if (io && type === 'human') {
      io.emit('admin_new_case', newCase);
    }

    res.json({ ...newCase.toObject(), caseType: type });
  } catch (error) {
    console.error("Create case error:", error);
    res.status(500).json({ error: "Failed to create support case." });
  }
});

// Create a follow-up case
router.post("/:id/followup", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user._id;
    const oldCaseId = req.params.id;

    const oldCase = await HumanSupportCase.findById(oldCaseId);
    if (!oldCase) {
      return res.status(404).json({ error: "Original case not found." });
    }

    if (oldCase.status !== 'closed') {
      oldCase.status = 'closed';
      oldCase.messages.push({
        role: 'system',
        content: 'STATUS_CHANGE:closed'
      });
    }

    const newCase = new HumanSupportCase({
      userId,
      title: `Follow-up to: ${oldCase.title}`,
      severity: oldCase.severity,
      issueType: oldCase.issueType,
      description: oldCase.description,
      parentCaseId: oldCase._id,
      messages: [
        {
          role: "user",
          content: `**Problem Area**\n${oldCase.issueType || 'General Enquiry'}\n\n**Severity Level**\n${oldCase.severity || 'Medium'}\n\n**Subject**\nFollow-up to: ${oldCase.title}\n\n**Description**\nThis case is a follow-up to Case #${oldCaseId}.\n\nPrevious Description:\n${oldCase.description || ''}`
        }
      ]
    });

    await newCase.save();

    oldCase.messages.push({
      role: 'system',
      content: `STATUS_CHANGE:followup_created:${newCase._id}`
    });
    await oldCase.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('admin_new_case', newCase);
    }

    res.json({ ...newCase.toObject(), caseType: 'human' });
  } catch (error) {
    console.error("Create follow-up error:", error);
    res.status(500).json({ error: "Failed to create follow-up case." });
  }
});

// Send a message to a specific case
router.post("/:id/message", requireAuth, async (req, res) => {
  try {
    const { message, attachment, attachments } = req.body;
    const userId = req.user.userId || req.user._id;
    const caseId = req.params.id;

    if (!message && !attachment && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ error: "Message or attachment is required." });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Gemini API key is not configured on the server." });
    }

    let supportCase = await HumanSupportCase.findById(caseId);
    let type = 'human';

    if (!supportCase) {
      supportCase = await AISupportCase.findById(caseId);
      type = 'ai';
    }

    if (!supportCase) {
      return res.status(404).json({ error: "Case not found" });
    }

    if (supportCase.userId.toString() !== userId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Unauthorized access to this case." });
    }

    let messageRole = "user";
    if (supportCase.userId.toString() !== userId.toString() && req.user.role === 'admin') {
      messageRole = "admin";
    }

    // Add user message to DB
    const newMessage = { role: messageRole, content: message || "Sent attachments" };
    if (attachment) newMessage.attachment = attachment;
    if (attachments && attachments.length > 0) newMessage.attachments = attachments;
    
    supportCase.messages.push(newMessage);
    
    // Auto-update title if it's the first user message
    if (type === 'human' && supportCase.title === "New Support Case" && supportCase.messages.length <= 2) {
       supportCase.title = message.length > 50 ? message.substring(0, 50) + "..." : message;
    }
    await supportCase.save();

    const io = req.app.get('io');

    if (type === 'human') {
      if (io) {
        io.to(caseId).emit('new_message', {
          caseId,
          message: newMessage
        });
      }
      return res.json({ message: "Message sent to support.", case: supportCase });
    }

    // --- AI Flow Below ---
    if (io) {
      io.to(caseId).emit('new_message', {
        caseId,
        message: newMessage
      });
    }

    // 1. Gather User Context
    const user = await User.findById(userId).select("email name provider");
    const projects = await Project.find({ userId })
      .select("repoName repoFullName framework selectedBranch buildCommand installCommand outputDirectory")
      .limit(5);

    const projectIds = projects.map(p => p._id);
    const deployments = await Deployment.find({ projectId: { $in: projectIds } })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("projectId status target source errorLogs createdAt");

    const recentDeploymentsContext = deployments.map(dep => {
      const proj = projects.find(p => p._id.toString() === dep.projectId?.toString());
      return {
        project: proj?.repoName || "Unknown",
        status: dep.status,
        target: dep.target,
        date: dep.createdAt,
        error: dep.status === "failed" ? dep.errorLogs : "None"
      };
    });

    const contextPrompt = `You are a helpful AI support agent for a cloud deployment platform (similar to Vercel). 
Your job is to help the user troubleshoot deployment errors, configure their projects, and answer questions.
You have access to the user's current account context so you can give highly specific and accurate answers.
Do not hallucinate fake projects. Only refer to the projects listed below.

--- USER CONTEXT ---
Name: ${user?.name || 'User'}
Email: ${user?.email || 'Unknown'}

Recent Projects:
${projects.map(p => `- ${p.repoName} (Framework: ${p.framework}, Branch: ${p.selectedBranch}, Build Cmd: ${p.buildCommand || 'N/A'}, Output Dir: ${p.outputDirectory || 'N/A'})`).join('\n') || 'No projects found.'}

Recent Deployments:
${recentDeploymentsContext.map(d => `- Project: ${d.project} | Status: ${d.status} | Target: ${d.target} | Date: ${d.date} ${d.error !== 'None' ? `| Error: ${JSON.stringify(d.error).substring(0, 200)}` : ''}`).join('\n') || 'No recent deployments.'}
--------------------

Respond naturally as an AI assistant. Use markdown for code blocks, bold text, and lists. Keep responses concise unless a detailed explanation is needed.`;

    // 2. Initialize Gemini & Retry Logic
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const fallbackModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest", "gemini-pro", "gemini-1.5-flash"];
    
    let result;
    let success = false;
    let lastError = null;

    // Consolidate history to guarantee alternation
    let contents = [
      { role: "user", parts: [{ text: contextPrompt }] },
      { role: "model", parts: [{ text: "Understood. I will act as the support agent and use this context to help the user." }] },
      { role: "user", parts: [{ text: "Start the conversation." }] }
    ];

    // supportCase.messages already includes the latest user message
    for (const msg of supportCase.messages) {
      const mappedRole = msg.role === 'user' ? 'user' : 'model';
      if (contents.length > 0 && contents[contents.length - 1].role === mappedRole) {
          contents[contents.length - 1].parts[0].text += "\n\n" + msg.content;
      } else {
          contents.push({ role: mappedRole, parts: [{ text: msg.content }] });
      }
    }

    // Gemini expects the last message to be from the user
    if (contents[contents.length - 1].role !== 'user') {
      contents.push({ role: 'user', parts: [{ text: 'Please continue.' }] });
    }

    for (const modelName of fallbackModels) {
      if (success) break;
      
      const model = genAI.getGenerativeModel({ model: modelName });

      for (let i = 0; i < 2; i++) {
        try {
          result = await model.generateContent({ contents });
          success = true;
          break; 
        } catch (err) {
          lastError = err;
          if (err.status === 503 || err.status === 429 || err.status === 404) {
            console.log(`[Support Chat] API error ${err.status} with ${modelName}, retrying in ${(i + 1) * 2} seconds...`);
            await new Promise(res => setTimeout(res, (i + 1) * 2000));
          } else {
            console.log(`[Support Chat] Unhandled error with ${modelName}:`, err.message);
            break; 
          }
        }
      }
    }

    if (!success) {
      throw lastError || new Error("All Gemini models exhausted or failed.");
    }

    const responseText = result.response.text();

    // Add model response to DB
    const modelMessage = { role: "model", content: responseText };
    supportCase.messages.push(modelMessage);
    await supportCase.save();

    // Return the newly created model message (with its DB generated ID and timestamp)
    const savedModelMessage = supportCase.messages[supportCase.messages.length - 1];

    if (io) {
      io.to(caseId).emit('new_message', {
        caseId,
        message: savedModelMessage
      });
    }

    res.json({ reply: savedModelMessage });
  } catch (error) {
    console.error("AI Support Chat Error:", error);
    res.status(500).json({ error: "Failed to process chat response.", details: error.message });
  }
});

// User update their own case status
router.patch("/:id/status", requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const userId = req.user.userId || req.user._id;

    if (!['open', 'closed'].includes(status)) {
       return res.status(400).json({ error: "Users can only set status to open or closed." });
    }
    
    const supportCase = await HumanSupportCase.findById(req.params.id);
    if (!supportCase) {
      return res.status(404).json({ error: "Case not found." });
    }

    if (supportCase.userId.toString() !== userId.toString()) {
      return res.status(403).json({ error: "Unauthorized access to this case." });
    }

    if (status === 'closed') {
      supportCase.closedByRole = 'user';
    } else if (status === 'open') {
      supportCase.closedByRole = undefined;
    }
    
    const systemMessage = {
      role: 'system',
      content: `STATUS_CHANGE:${status}`,
      timestamp: new Date()
    };
    supportCase.messages.push(systemMessage);
    supportCase.status = status;
    await supportCase.save();
    
    const io = req.app.get('io');
    if (io) {
       // We need the _id of the message that was just added
       const addedMessage = supportCase.messages[supportCase.messages.length - 1];
       io.to(req.params.id).emit('case_status_updated', { caseId: req.params.id, status, closedByRole: supportCase.closedByRole, message: addedMessage });
       io.emit('admin_case_updated', supportCase);
    }
    
    res.json({ message: "Status updated.", case: supportCase });
  } catch (error) {
    console.error("User update status error:", error);
    res.status(500).json({ error: "Failed to update case status." });
  }
});

// Admin Get all human cases
router.get("/admin/cases", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Requires admin role." });
    }
    
    const { status, search } = req.query;
    let query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (search) {
       const users = await User.find({ 
           $or: [ { name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } } ] 
       }).select('_id');
       const userIds = users.map(u => u._id);
       
       query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { userId: { $in: userIds } }
       ];
    }

    const cases = await HumanSupportCase.find(query).populate('userId', 'name email').sort({ updatedAt: -1 });
    const formattedCases = cases.map(c => ({ ...c.toObject(), caseType: 'human' }));
    res.json(formattedCases);
  } catch (error) {
    console.error("Admin fetch cases error:", error);
    res.status(500).json({ error: "Failed to fetch admin support cases." });
  }
});

// Admin update case status
router.patch("/admin/cases/:id/status", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Requires admin role." });
    }
    const { status } = req.body;
    if (!['open', 'in-progress', 'resolved', 'closed'].includes(status)) {
       return res.status(400).json({ error: "Invalid status." });
    }
    
    let updateData = { $set: { status } };
    if (status === 'closed') {
      updateData.$set.closedByRole = 'admin';
    } else if (status === 'open' || status === 'in-progress') {
      updateData.$unset = { closedByRole: "" };
    }
    
    const systemMessage = {
      role: 'system',
      content: `STATUS_CHANGE:${status}`,
      timestamp: new Date()
    };
    updateData.$push = { messages: systemMessage };
    
    const supportCase = await HumanSupportCase.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    
    if (!supportCase) {
      return res.status(404).json({ error: "Case not found." });
    }
    
    const io = req.app.get('io');
    if (io) {
       const addedMessage = supportCase.messages[supportCase.messages.length - 1];
       io.to(req.params.id).emit('case_status_updated', { caseId: req.params.id, status, closedByRole: supportCase.closedByRole, message: addedMessage });
       io.emit('admin_case_updated', supportCase);
    }
    
    res.json({ message: "Status updated.", case: supportCase });
  } catch (error) {
    console.error("Admin update status error:", error);
    res.status(500).json({ error: "Failed to update case status." });
  }
});

export default router;
