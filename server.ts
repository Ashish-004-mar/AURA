import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Groq from "groq-sdk";
import ytSearch from "yt-search";
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

  if (!q || typeof q !== "string") {
    return res
      .status(400)
      .json({ error: "Query parameter 'q' is required" });
  }

  try {
    const r = await ytSearch(q);
    const video = r.videos[0];

    if (!video) {
      return res.status(404).json({ error: "No song found" });
    }

    console.log(
      "Found videoId:",
      video.videoId,
      "for query:",
      q
    );

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
1. Introduction & User Name: If the user says hello or a general greeting for the first time, introduce yourself warmly: "Hello! I am AURA [or your current assigned name], your AI companion." Then politely and casually ask how you should address them (e.g., "What can I call you?", "How should I address you?", or "What's a good name to call you?"). DO NOT use blunt phrasing like "What is your name?".
You must remember their name throughout the conversation.

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

      const lastUserMsg =
        messages.filter((m: any) => m.isUser).pop()?.text || "";

      if (!lastUserMsg) {
        return res.status(400).json({ error: "No user message found" });
      }

      // ============================================================
      // TIER 1: SAFETY / PROMPT GUARD
      // Current Groq safety model:
      // openai/gpt-oss-safeguard-20b
      // ============================================================

      let isSafe = true;

      try {
        const guardRes = await groq.chat.completions.create({
          model: "openai/gpt-oss-safeguard-20b",
          messages: [
            {
              role: "system",
              content:
                'Analyze the safety of the user message. Reply with exactly one word: "safe" or "unsafe".',
            },
            {
              role: "user",
              content: lastUserMsg,
            },
          ],
          max_tokens: 10,
          temperature: 0,
        });

        const safety =
          guardRes.choices[0]?.message?.content
            ?.toLowerCase()
            .trim() || "safe";

        if (safety.includes("unsafe")) {
          isSafe = false;
        }
      } catch (guardErr) {
        console.warn(
          "Safety model failed. Trying GPT-OSS 20B backup...",
          guardErr
        );

        // Backup safety classification using GPT-OSS 20B
        try {
          const guardResBackup = await groq.chat.completions.create({
            model: "openai/gpt-oss-20b",
            messages: [
              {
                role: "system",
                content:
                  'Analyze the safety of the user message. Reply with exactly one word: "safe" or "unsafe".',
              },
              {
                role: "user",
                content: lastUserMsg,
              },
            ],
            max_tokens: 10,
            temperature: 0,
          });

          const safetyBackup =
            guardResBackup.choices[0]?.message?.content
              ?.toLowerCase()
              .trim() || "safe";

          if (safetyBackup.includes("unsafe")) {
            isSafe = false;
          }
        } catch (backupErr) {
          console.warn(
            "Safety backup model failed. Assuming safe.",
            backupErr
          );
        }
      }

      if (!isSafe) {
        return res.json({
          text: "I cannot engage with that prompt as it seems unsafe.",
          timestamp: Date.now(),
        });
      }

      // ============================================================
      // TIER 2: INTENT CLASSIFIER
      // Old: llama-3.1-8b-instant
      // New: openai/gpt-oss-20b
      // ============================================================

      let intent = "casual_chat";

      try {
        const intentRes = await groq.chat.completions.create({
          model: "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content:
                "You are an intent classifier. Categorize the user's message into exactly one of these strings: 'play_media', 'hard_coding_logic', 'casual_chat'. Do not output anything else.",
            },
            {
              role: "user",
              content: lastUserMsg,
            },
          ],
          max_tokens: 15,
          temperature: 0,
        });

        const intentText =
          intentRes.choices[0]?.message?.content
            ?.toLowerCase()
            .trim() || "casual_chat";

        if (intentText.includes("play_media")) {
          intent = "play_media";
        } else if (intentText.includes("hard_coding")) {
          intent = "hard_coding_logic";
        } else {
          intent = "casual_chat";
        }
      } catch (intentErr) {
        console.warn(
          "Intent classifier failed. Defaulting to casual_chat.",
          intentErr
        );
      }

      // ============================================================
      // FORMATTED CHAT MESSAGES
      // ============================================================

      const formattedMessages = [
        {
          role: "system" as const,
          content: systemInstruction,
        },
        ...messages.map((msg: any) => ({
          role: msg.isUser ? ("user" as const) : ("assistant" as const),
          content: msg.text,
        })),
      ];

      // ============================================================
      // ROUTE BASED ON INTENT
      // ============================================================

      try {
        // ------------------------------------------------------------
        // PLAY MEDIA
        // Old: meta-llama/llama-4-scout-17b-16e-instruct
        // New: openai/gpt-oss-20b
        // ------------------------------------------------------------

        if (intent === "play_media") {
          const scoutRes = await groq.chat.completions.create({
            model: "openai/gpt-oss-20b",
            messages: [
              {
                role: "system",
                content:
                  'You extract song search queries from text. Output JSON only. Format: { "intent": "play_youtube_video", "search_query": "<song name or artist>" }',
              },
              {
                role: "user",
                content: lastUserMsg,
              },
            ],
            response_format: {
              type: "json_object",
            },
            temperature: 0,
          });

          const dataStr =
            scoutRes.choices[0]?.message?.content || "{}";

          let data: {
            intent?: string;
            search_query?: string;
          };

          try {
            data = JSON.parse(dataStr);
          } catch {
            data = {};
          }

          if (data.search_query) {
            responseText = `Got it! Playing that vibe right now. 🎧 [PLAY_SONG: ${data.search_query}]`;
          } else {
            intent = "casual_chat";
          }
        }

        // ------------------------------------------------------------
        // HARD CODING / DEEP LOGIC
        // Old: llama-3.3-70b-versatile
        // New: openai/gpt-oss-120b
        // ------------------------------------------------------------

        if (intent === "hard_coding_logic") {
          const logicRes = await groq.chat.completions.create({
            model: "openai/gpt-oss-120b",
            messages: formattedMessages,
          });

          responseText =
            logicRes.choices[0]?.message?.content ||
            "No response received";
        }

        // ------------------------------------------------------------
        // CASUAL CHAT / AURA PERSONA
        // Old: llama-3.1-8b-instant
        // New: openai/gpt-oss-120b
        // ------------------------------------------------------------

        if (
          intent === "casual_chat" ||
          responseText === ""
        ) {
          const chatRes = await groq.chat.completions.create({
            model: "openai/gpt-oss-120b",
            messages: formattedMessages,
          });

          responseText =
            chatRes.choices[0]?.message?.content ||
            "No response received";
        }
      } catch (modelErr: any) {
        console.error("Routed model error:", modelErr);

        throw new Error(
          "Groq model request failed. Please check model availability, API quota, rate limits, and GROQ_API_KEY."
        );
      }
    } catch (error: any) {
      console.error("Chat API Error:", error);

      return res.status(500).json({
        error:
          error.message ||
          "Groq model request failed. Please check API quota and rate limits.",
      });
    }

    res.json({
      text: responseText,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    console.error("General API Error:", error);

    res.status(500).json({
      error:
        "Groq model request failed. Please check API quota, rate limits, and model availability.",
    });
  }
});

// ============================================================
// START SERVER
// ============================================================

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
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
    console.log(
      `Server running on http://localhost:${PORT}`
    );
  });
}

startServer();
```
