import express from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Deployment from "../models/Deployment.js";
import SupportCase from "../models/SupportCase.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = express.Router();

// Get all cases for a user
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user._id;
    const cases = await SupportCase.find({ userId }).sort({ updatedAt: -1 });
    res.json(cases);
  } catch (error) {
    console.error("Fetch cases error:", error);
    res.status(500).json({ error: "Failed to fetch support cases." });
  }
});

// Get a specific case
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user._id;
    const supportCase = await SupportCase.findOne({ _id: req.params.id, userId });
    
    if (!supportCase) {
      return res.status(404).json({ error: "Case not found" });
    }
    
    res.json(supportCase);
  } catch (error) {
    console.error("Fetch case error:", error);
    res.status(500).json({ error: "Failed to fetch support case." });
  }
});

// Create a new case
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user._id;
    const { title, severity } = req.body;

    const newCase = new SupportCase({
      userId,
      title: title || "New Support Case",
      severity: severity || "medium",
      messages: [
        {
          role: "model",
          content: "Hello! I am your AI Support Assistant. I have context about your projects and recent deployments. How can I help you today?"
        }
      ]
    });

    await newCase.save();
    res.json(newCase);
  } catch (error) {
    console.error("Create case error:", error);
    res.status(500).json({ error: "Failed to create support case." });
  }
});

// Send a message to a specific case
router.post("/:id/message", requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.user.userId || req.user._id;
    const caseId = req.params.id;

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Gemini API key is not configured on the server." });
    }

    const supportCase = await SupportCase.findOne({ _id: caseId, userId });
    if (!supportCase) {
      return res.status(404).json({ error: "Case not found" });
    }

    // Add user message to DB
    supportCase.messages.push({ role: "user", content: message });
    
    // Auto-update title if it's the first user message
    if (supportCase.title === "New Support Case" && supportCase.messages.length <= 2) {
       supportCase.title = message.length > 50 ? message.substring(0, 50) + "..." : message;
    }
    await supportCase.save();

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

    for (const modelName of fallbackModels) {
      if (success) break;
      
      const model = genAI.getGenerativeModel({ model: modelName });

      for (let i = 0; i < 2; i++) {
        try {
          const chat = model.startChat({
            history: [
              { role: "user", parts: [{ text: contextPrompt }] },
              { role: "model", parts: [{ text: "Understood. I will act as the support agent and use this context to help the user." }] },
              // Map DB history format to Gemini format (excluding the very last user message which is sent dynamically)
              ...supportCase.messages.slice(0, -1).map((msg) => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }],
              }))
            ],
          });

          result = await chat.sendMessage([{ text: message }]);
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

    res.json({ reply: savedModelMessage });
  } catch (error) {
    console.error("AI Support Chat Error:", error);
    res.status(500).json({ error: "Failed to process chat response.", details: error.message });
  }
});

export default router;
