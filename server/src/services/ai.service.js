import { GoogleGenerativeAI } from "@google/generative-ai";

export async function generateIssueDiagnosis(issue, latestEvent) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("AI Provider not configured. Please add GEMINI_API_KEY.");
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  const stackTrace = latestEvent?.stack_trace || "No stack trace available";
  const errorMessage = latestEvent?.message || issue.title;
  const errorType = latestEvent?.error_type || "Unknown Error";
  const requestUrl = latestEvent?.http_url || "Unknown URL";
  const requestMethod = latestEvent?.http_method || "Unknown Method";

  const prompt = `You are an expert AI software debugger. 
We have encountered a runtime error in our application.

Error Type: ${errorType}
Message: ${errorMessage}
HTTP Context: ${requestMethod} ${requestUrl}

Deobfuscated Stack Trace:
\`\`\`
${stackTrace}
\`\`\`

Task:
Provide a concise, human-readable Root Cause Analysis (what exactly went wrong and why) followed by a specific Code Fix snippet to resolve it.

Format your response exactly as follows:

### Root Cause
[Explain the root cause in 1-2 paragraphs]

### Suggested Fix
[Provide a code snippet showing how to fix the issue]
`;

  const fallbackModels = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"];
  let lastError;
  
  const AI_TIMEOUT_MS = 15000;

  for (const modelName of fallbackModels) {
    const currentModel = genAI.getGenerativeModel({ model: modelName });
    for (let i = 0; i < 3; i++) {
      try {
        const result = await currentModel.generateContent(prompt, {
          signal: AbortSignal.timeout(AI_TIMEOUT_MS)
        });
        let text = result.response.text().trim();
        
        // Split into Root Cause and Suggested Fix
        const parts = text.split('### Suggested Fix');
        let rootCause = parts[0].replace('### Root Cause', '').trim();
        let suggestedFix = parts[1] ? parts[1].trim() : 'No fix could be determined.';
        
        return {
          analysis_text: rootCause,
          suggested_fix: suggestedFix
        };
      } catch (err) {
        lastError = err;
        
        if (err.name === 'AbortError' || err.name === 'TimeoutError') {
          console.error(`[AI Diagnosis] AI provider timeout after ${AI_TIMEOUT_MS}ms with ${modelName}`);
          throw new Error('AI provider timeout');
        }
        
        if (err.status === 503 || err.status === 429) {
          console.log(`[AI Diagnosis] API error ${err.status} with ${modelName}, retrying...`);
          await new Promise(res => setTimeout(res, (i + 1) * 3000));
        } else {
          // If it's not a rate limit / unavailable, try next model or throw
          break; 
        }
      }
    }
  }
  
  throw new Error(lastError?.message || "Failed to generate diagnosis via Gemini.");
}
