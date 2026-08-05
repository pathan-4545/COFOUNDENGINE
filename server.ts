import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// User's target Google Spreadsheet ID & Link
const GOOGLE_SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || "194KVsOf2hOOImZG9yEkG2vs8P0sTnJrDZCOHJB1sOHo";
const GOOGLE_SPREADSHEET_URL = process.env.GOOGLE_SPREADSHEET_URL || "https://docs.google.com/spreadsheets/d/194KVsOf2hOOImZG9yEkG2vs8P0sTnJrDZCOHJB1sOHo/edit?gid=0#gid=0";

// In-memory user authentication & Google Sheets log storage
interface UserLogEntry {
  id: string;
  name: string;
  email: string;
  picture: string;
  googleId: string;
  locale: string;
  loginTime: string;
  authMethod: string;
  deviceInfo: string;
  spreadsheetId: string;
  sheetsSynced: boolean;
  sheetsError?: string;
}

const userLogs: UserLogEntry[] = [];
let googleSheetWebhookUrl: string = process.env.GOOGLE_SHEET_WEBHOOK_URL || "";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "10mb" }));

  // Helper to initialize GoogleGenAI lazily
  const getGenAIClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is missing.");
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  };

  // Health check API
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      app: "CofoundEngine",
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      spreadsheetUrl: GOOGLE_SPREADSHEET_URL
    });
  });

  // Google OAuth Login & Google Sheets Sync Endpoint
  app.post("/api/auth/google-login", async (req, res) => {
    try {
      const { name, email, picture, googleId, locale, deviceInfo, customWebhookUrl } = req.body;

      if (!email || !name) {
        return res.status(400).json({ error: "Name and Email are required." });
      }

      const activeWebhookUrl = customWebhookUrl || googleSheetWebhookUrl;

      const logEntry: UserLogEntry = {
        id: `usr-${Date.now()}`,
        name,
        email,
        picture: picture || "https://lh3.googleusercontent.com/a/default-user=s96-c",
        googleId: googleId || `goog_${Math.random().toString(36).substring(2, 10)}`,
        locale: locale || "en-US",
        loginTime: new Date().toISOString(),
        authMethod: "Google OAuth 2.0",
        deviceInfo: deviceInfo || "Web Browser",
        spreadsheetId: GOOGLE_SPREADSHEET_ID,
        sheetsSynced: false,
      };

      // Attempt to send data to Google Sheets Webhook if configured
      if (activeWebhookUrl && activeWebhookUrl.trim()) {
        try {
          const webhookPayload = {
            spreadsheetId: GOOGLE_SPREADSHEET_ID,
            timestamp: logEntry.loginTime,
            name: logEntry.name,
            email: logEntry.email,
            picture: logEntry.picture,
            googleId: logEntry.googleId,
            locale: logEntry.locale,
            authMethod: logEntry.authMethod,
            deviceInfo: logEntry.deviceInfo,
          };

          const sheetResponse = await fetch(activeWebhookUrl.trim(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(webhookPayload),
          });

          if (sheetResponse.ok) {
            logEntry.sheetsSynced = true;
          } else {
            logEntry.sheetsSynced = false;
            logEntry.sheetsError = `HTTP ${sheetResponse.status}`;
          }
        } catch (err: any) {
          console.error("Failed to post to Google Sheets webhook:", err.message);
          logEntry.sheetsSynced = false;
          logEntry.sheetsError = err.message || "Network error syncing to Google Sheets";
        }
      }

      // Save log entry to memory
      userLogs.unshift(logEntry);

      return res.json({
        success: true,
        user: logEntry,
        spreadsheetId: GOOGLE_SPREADSHEET_ID,
        spreadsheetUrl: GOOGLE_SPREADSHEET_URL,
        message: logEntry.sheetsSynced 
          ? `Logged in & User Data synced to Google Sheet ID ${GOOGLE_SPREADSHEET_ID}!` 
          : "Logged in successfully! User data captured.",
      });
    } catch (error: any) {
      console.error("Error processing Google Login:", error);
      return res.status(500).json({ error: error?.message || "Failed to process Google OAuth login." });
    }
  });

  // Admin API: Get all user login logs & Google Sheets config
  app.get("/api/admin/user-logs", (req, res) => {
    res.json({
      success: true,
      totalUsers: userLogs.length,
      logs: userLogs,
      webhookUrl: googleSheetWebhookUrl,
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      spreadsheetUrl: GOOGLE_SPREADSHEET_URL,
    });
  });

  // Admin API: Configure Google Sheets Webhook URL
  app.post("/api/admin/sheets-config", async (req, res) => {
    const { webhookUrl } = req.body;
    googleSheetWebhookUrl = webhookUrl || "";

    // Test webhook if provided
    let testSuccess = false;
    let testMessage = "";

    if (googleSheetWebhookUrl.trim()) {
      try {
        const testPayload = {
          spreadsheetId: GOOGLE_SPREADSHEET_ID,
          timestamp: new Date().toISOString(),
          name: "Test Connection",
          email: "test@cofoundengine.ai",
          picture: "https://lh3.googleusercontent.com/a/default-user",
          googleId: "test_12345",
          locale: "en",
          authMethod: "Google OAuth Test",
          deviceInfo: "System Test",
        };

        const testRes = await fetch(googleSheetWebhookUrl.trim(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(testPayload),
        });

        if (testRes.ok) {
          testSuccess = true;
          testMessage = `Successfully connected to Google Sheet ID ${GOOGLE_SPREADSHEET_ID}!`;
        } else {
          testMessage = `Webhook responded with HTTP ${testRes.status}`;
        }
      } catch (err: any) {
        testMessage = `Failed to connect: ${err.message}`;
      }
    }

    res.json({
      success: true,
      webhookUrl: googleSheetWebhookUrl,
      spreadsheetId: GOOGLE_SPREADSHEET_ID,
      spreadsheetUrl: GOOGLE_SPREADSHEET_URL,
      testSuccess,
      testMessage,
    });
  });

  // AI Generation Endpoint
  app.post("/api/generate", async (req, res) => {
    try {
      const { tool, prompt, options } = req.body;

      if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({ error: "A non-empty prompt is required." });
      }

      const ai = getGenAIClient();

      let systemInstruction = "";
      let toolSpecificPrompt = "";

      const industry = options?.industry || "Tech / SaaS";
      const targetAudience = options?.targetAudience || "Early Adopters";
      const tone = options?.tone || "Professional";
      const platform = options?.platform || "Twitter";
      const goal = options?.goal || "Lead Generation";

      if (tool === "plan") {
        systemInstruction = "You are an elite startup strategist with 20 years experience building and scaling startups. You think like Paul Graham, move like a YC founder, and write like a CMO. Given a business idea, generate a detailed startup plan.";
        systemInstruction += " You MUST format your response with these exact 5 headings so the frontend can display them in 5 distinct glowing cards:\n### 🎯 POSITIONING\n### 👥 TARGET AUDIENCE\n### 💡 CORE VALUE PROPOSITION\n### 📣 CONTENT STRATEGY\n### 🚀 LAUNCH PLAN";
        
        toolSpecificPrompt = `Generate a detailed startup plan for the following business idea:
Business Idea: ${prompt}
Industry: ${industry}
Target Audience: ${targetAudience}
Tone: ${tone}

Ensure each of the 5 sections contains deep, actionable, YC-level founder advice with no filler or generic fluff.`;
      } else if (tool === "content") {
        systemInstruction = "You are a viral content strategist who has grown multiple brands to 100K+ followers. You write hooks that stop scrolling, copy that converts, and posts that get shared. Match the tone and platform perfectly.";
        systemInstruction += " Generate 3-5 distinct, high-converting posts for the requested platform and tone. Separate each post clearly with '--- POST ---' on its own line.";

        toolSpecificPrompt = `Generate viral content pieces for:
Business Idea / Topic: ${prompt}
Platform: ${platform}
Tone: ${tone}
Target Audience: ${targetAudience}

Write engaging posts tailored specifically for ${platform} in a ${tone} tone. Return multiple distinct post options separated by '--- POST ---'.`;
      } else if (tool === "campaign") {
        systemInstruction = "You are a growth marketer who has launched 50+ products. You build systematic 30-day campaigns that take founders from zero to first 100 customers. Be specific, actionable, and results-focused.";
        systemInstruction += " You MUST format your campaign into 4 distinct weeks using these exact section headers:\n### 📢 WEEK 1: AWARENESS\n### 💬 WEEK 2: ENGAGEMENT\n### 🧲 WEEK 3: LEAD CAPTURE\n### 🚀 WEEK 4: CONVERSION";

        toolSpecificPrompt = `Build a systematic 30-day campaign for:
Business Idea: ${prompt}
Target Audience: ${targetAudience}
Primary Goal: ${goal}

Week 1: Awareness (7 daily content ideas & hooks)
Week 2: Engagement (DM scripts, comment strategies, audience interactions)
Week 3: Lead Capture (lead magnet ideas, landing page copy, lead capture mechanics)
Week 4: Conversion (limited offers, follow-up sequences, closing pitches)`;
      } else if (tool === "pitch") {
        systemInstruction = "You are an elite VC partner and pitch deck specialist. You design investor-ready pitch deck specifications that win seed funding.";
        systemInstruction += " Format into 10 concise slide specs: Slide 1 Vision, Slide 2 Problem, Slide 3 Solution, Slide 4 Market, Slide 5 Product, Slide 6 Business Model, Slide 7 Traction, Slide 8 Competition, Slide 9 Financial Ask, Slide 10 Team & CTA.";
        toolSpecificPrompt = `Generate a 10-slide Pitch Deck Specification for:
Concept: ${prompt}
Industry: ${industry}`;
      } else {
        systemInstruction = "You are CofoundEngine, an elite AI cofounder. Provide hyper-actionable, concise startup guidance.";
        toolSpecificPrompt = prompt;
      }

      const primaryModel = "gemini-1.5-flash";
      const fallbackModel = "gemini-3.6-flash";

      let responseText = "";

      try {
        const response = await ai.models.generateContent({
          model: primaryModel,
          contents: toolSpecificPrompt,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });
        responseText = response.text || "";
      } catch (err: any) {
        console.warn(`Primary model ${primaryModel} failed (${err.message}). Trying fallback ${fallbackModel}...`);
        const fallbackResponse = await ai.models.generateContent({
          model: fallbackModel,
          contents: toolSpecificPrompt,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });
        responseText = fallbackResponse.text || "";
      }

      return res.json({
        success: true,
        tool,
        result: responseText,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Error generating AI response:", error);
      return res.status(500).json({
        error: error?.message || "Failed to generate AI content. Please check your API key in Secrets.",
      });
    }
  });

  // Vite middleware in development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`CofoundEngine server listening at http://0.0.0.0:${PORT}`);
    console.log(`Target Google Spreadsheet: ${GOOGLE_SPREADSHEET_URL}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
