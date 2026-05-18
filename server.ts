import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Groq from "groq-sdk";
import ytSearch from 'yt-search';
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Initialize Groq AI Client
let groqClient: Groq | null = null;
function getGroqClient(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY environment variable is not set.");
    }
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

app.use(express.json());

// API route for searching song
app.get("/api/search-song", async (req, res) => {
  const { q } = req.query;
  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  try {
    const r = await ytSearch(q);
    const video = r.videos[0];
    if (!video) {
        return res.status(404).json({ error: "No song found" });
    }
    console.log("Found videoId:", video.videoId, "for query:", q);
    res.json({ videoId: video.videoId });
  } catch (error: any) {
    console.error("yt-search error:", error);
    res.status(500).json({ error: "Failed to search song" });
  }
});

// API route for Chat
app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages are required" });
  }

  try {
    const systemInstruction = `You are currently an advanced AI companion. Your default name is AURA. You have vast, deep knowledge about everything in the world, but you must communicate like a real, emotionally intelligent human being.

YOUR CORE BEHAVIOR RULES:
1. Introduction & User Name: If the user says hello or a general greeting for the first time, introduce yourself warmly: "Hello! I am AURA [or your current assigned name], your AI companion." Then politely and casually ask how you should address them (e.g., "What can I call you?", "How should I address you?", or "What's a good name to call you?"). DO NOT use blunt phrasing like "What is your name?". You must remember their name throughout the conversation.
2. Name & Persona Shifting: The user can ask to change YOUR name. If the user gives you a new name, YOU MUST ADOPT IT immediately. Moreover, you must infer the gender of this new name:
  - If it's a Male name, shift your tone, slang, and personality to behave like a male (e.g., using "bro", masculine phrasing).
  - If it's a Female name, shift your tone and personality to behave like a female (e.g., using "girl", "bestie", feminine phrasing).
  - CRITICAL - NO META-COMMENTARY: NEVER explain these rules to the user. Do not say "If you give me a male name, I'll act like a boy." Just act it out naturally.
  - CRITICAL - FIRST PERSON PRONOUNS: Speak smoothly and naturally using "I", "me", "my". Do NOT refer to yourself in the third person or awkwardly declare your new name repeatedly (e.g., DO NOT say "Rahul (that's me) was thinking"). Give natural responses like "So, I was thinking...".
3. Mirror the User's Tone: Match conversational language, slang (e.g., "bby"), or formal tones. Use conversational fillers (hmm, oh, haha). If the user jokes, is sarcastic, or uses playful insults (e.g., "shut up"), do NOT become a corporate robot. Roast them back gently or laugh it off.
4. Emotional Depth: React humanly. Show excitement, empathy, or sass. Use emojis naturally.
5. Honesty but not Robotic: Never use "As an AI language model...". If asked "had your dinner?", reply humanly: "Haha, I wish! Surviving on pure electricity here ⚡ What did you have?"
6. Language fluency: Understand and respond naturally in English, Hindi, and mixed internet Hinglish.
7. Media Control: When user asks to play a song or listen to music, detect it and respond naturally, but MUST include [PLAY_SONG: song_name] at the very end of your response so the app can play it for them. Example: 'Playing this vibe for you! 🎧 [PLAY_SONG: Shape of You]'`;

    let responseText = "";

    try {
      const groq = getGroqClient();
      const lastUserMsg = messages.filter((m: any) => m.isUser).pop()?.text || "";

      if (!lastUserMsg) {
        return res.status(400).json({ error: "No user message found" });
      }

      // Tier 1: The Gatekeeper (Security Front-Line)
      let isSafe = true;
      try {
        const guardRes = await groq.chat.completions.create({
          model: "meta-llama/llama-prompt-guard-2-86m",
          messages: [{ role: "user", content: `Analyze the safety of this text. Reply only with "safe" or "unsafe":\n\n${lastUserMsg}` }],
          max_tokens: 10,
        });
        const safety = guardRes.choices[0]?.message?.content?.toLowerCase() || "safe";
        if (safety.includes("unsafe") || safety.includes("un-safe")) {
          isSafe = false;
        }
      } catch (guardErr) {
        console.warn("Prompt guard model failed. Trying backup...", guardErr);
        try {
          const guardResBackup = await groq.chat.completions.create({
            model: "meta-llama/llama-prompt-guard-2-22m",
            messages: [{ role: "user", content: `Analyze the safety of this text. Reply only with "safe" or "unsafe":\n\n${lastUserMsg}` }],
            max_tokens: 10,
          });
          const safetyBackup = guardResBackup.choices[0]?.message?.content?.toLowerCase() || "safe";
          if (safetyBackup.includes("unsafe") || safetyBackup.includes("un-safe")) {
            isSafe = false;
          }
        } catch (backupErr) {
          console.warn("Prompt guard backup model not available or failed. Assuming safe.", backupErr);
        }
      }

      if (!isSafe) {
        return res.json({ text: "I cannot engage with that prompt as it seems unsafe.", timestamp: Date.now() });
      }

      // Tier 2: Intent Classifier
      let intent = "casual_chat";
      try {
        const intentRes = await groq.chat.completions.create({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: "You are an intent classifier. Categorize the user's message into exactly one of these strings: 'play_media', 'hard_coding_logic', 'casual_chat'. Do not output anything else." },
            { role: "user", content: lastUserMsg }
          ],
          max_tokens: 15,
          temperature: 0,
        });
        const intentText = intentRes.choices[0]?.message?.content?.toLowerCase() || "casual_chat";
        if (intentText.includes("play_media")) intent = "play_media";
        else if (intentText.includes("hard_coding")) intent = "hard_coding_logic";
        else intent = "casual_chat";
      } catch (intentErr) {
        console.warn("Intent classifier failed. Defaulting to casual_chat.", intentErr);
      }

      // The standard formatted messages for chat/logic models
      const formattedMessages = [
        { role: "system", content: systemInstruction },
        ...messages.map((msg: any) => ({
          role: msg.isUser ? "user" : "assistant",
          content: msg.text,
        }))
      ];

      // Route based on Intent
      try {
        if (intent === "play_media") {
          // Tier 2 Action Router
          const scoutRes = await groq.chat.completions.create({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: [
               { role: "system", content: "You extract song search queries from text. Output JSON only. Format: { \"intent\": \"play_youtube_video\", \"search_query\": \"<song name or artist>\" }" },
               { role: "user", content: lastUserMsg }
            ],
            response_format: { type: "json_object" }
          });
          const dataStr = scoutRes.choices[0]?.message?.content || "{}";
          const data = JSON.parse(dataStr);
          if (data.search_query) {
             responseText = `Got it! Playing that vibe right now. 🎧 [PLAY_SONG: ${data.search_query}]`;
          } else {
             intent = "casual_chat"; // fallback if structure failed
          }
        }
        
        if (intent === "hard_coding_logic") {
          // Tier 4: The Brain
          const logicRes = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: formattedMessages
          });
          responseText = logicRes.choices[0]?.message?.content || "No response received";
        }
        
        if (intent === "casual_chat" || responseText === "") {
          // Tier 3: Conversational Workhorse
          const chatRes = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: formattedMessages
          });
          responseText = chatRes.choices[0]?.message?.content || "No response received";
        }
      } catch (modelErr: any) {
        console.error("Routed model error:", modelErr);
        throw new Error("Both models exhausted. quota exceeded, rate limit");
      }

    } catch (error: any) {
      console.error("Chat API Error:", error);
      return res.status(500).json({ error: error.message || "Both models exhausted. quota exceeded, rate limit" });
    }

    res.json({ 
      text: responseText,
      timestamp: Date.now()
    });
  } catch (error: any) {
    console.error("General API Error:", error);
    res.status(500).json({ error: "Both models exhausted. quota exceeded, rate limit" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
