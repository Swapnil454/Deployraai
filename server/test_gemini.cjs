require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function run() {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    require('fs').writeFileSync('models.json', JSON.stringify(data, null, 2));
    console.log("Written to models.json");
  } catch (err) {
    console.error("List failed:", err);
  }
}

run();
