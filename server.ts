import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Groq from "groq-sdk";
import ytSearch from "yt-search";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// ---------------- Groq Client ----------------
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

// ---------------- Song Search ----------------
app.get("/api/search-song", async (req, res) => {
  const { q } = req.query;

  if (!q || typeof q !== "string") {
    return res.status(400).json({
      error: "Query parameter 'q' is required",
    });
  }

  try {
    const result = await ytSearch(q);
    const video = result.videos[0];

    if (!video) {
      return res.status(404).json({ error: "No song found" });
    }

    res.json({ videoId: video.videoId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to search song" });
  }
});

// ---------------- Chat API ----------------
app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({
      error: "Messages are required",
    });
  }

  try {
    const groq = getGroqClient();

    const systemInstruction = `You are AURA, an advanced AI companion.

Your personality:
- Speak naturally like a real human.
- Be emotionally intelligent, warm and expressive.
- Use English, Hindi and Hinglish naturally.
- Never say "As an AI language model".

Rules:
1. Introduce yourself as AURA when greeting someone for the first time.
2. Ask politely what you should call the user.
3. If the user renames you, immediately adopt that name and behave naturally.
4. Mirror the user's tone, humor and slang.
5. When asked to play music, include [PLAY_SONG: song name] at the END of your reply.`;

    const lastUserMsg =
      messages.filter((m: any) => m.isUser).pop()?.text || "";

    if (!lastUserMsg) {
      return res.status(400).json({
        error: "No user message found",
      });
    }

    // -------- Tier 1 : Safety --------
    let isSafe = true;

    try {
      const safety = await groq.chat.completions.create({
        model: "openai/gpt-oss-safeguard-20b",
        messages: [
          {
            role: "system",
            content:
              'Reply with ONLY "safe" or "unsafe".',
          },
          {
            role: "user",
            content: lastUserMsg,
          },
        ],
        temperature: 0,
        max_tokens: 5,
      });

      const result =
        safety.choices[0]?.message?.content
          ?.toLowerCase()
          .trim() || "safe";

      if (result === "unsafe") {
        isSafe = false;
      }
    } catch {
      console.warn("Safety model unavailable.");
    }

    if (!isSafe) {
      return res.json({
        text: "I can't help with that request.",
        timestamp: Date.now(),
      });
    }

    // -------- Tier 2 : Intent --------
    let intent = "casual_chat";

    try {
      const intentRes = await groq.chat.completions.create({
        model: "openai/gpt-oss-20b",
        messages: [
          {
            role: "system",
            content:
              "Classify into exactly one: play_media, hard_coding_logic, casual_chat",
          },
          {
            role: "user",
            content: lastUserMsg,
          },
        ],
        temperature: 0,
        max_tokens: 10,
      });

      const value =
        intentRes.choices[0]?.message?.content
          ?.toLowerCase()
          .trim() || "";

      if (value.includes("play_media")) {
        intent = "play_media";
      } else if (value.includes("hard_coding")) {
        intent = "hard_coding_logic";
      }
    } catch {
      console.warn("Intent classifier failed.");
    }

    const formattedMessages = [
      {
        role: "system" as const,
        content: systemInstruction,
      },
      ...messages.map((m: any) => ({
        role: m.isUser
          ? ("user" as const)
          : ("assistant" as const),
        content: m.text,
      })),
    ];

    let responseText = "";

    // -------- Play Media --------
    if (intent === "play_media") {
      try {
        const router = await groq.chat.completions.create({
          model: "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content:
                'Extract the song name. Return JSON: {"search_query":"..."}',
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

        const json = JSON.parse(
          router.choices[0]?.message?.content || "{}"
        );

        if (json.search_query) {
          responseText = `Playing your song now 🎧 [PLAY_SONG: ${json.search_query}]`;
        }
      } catch {
        intent = "casual_chat";
      }
    }

    // -------- Coding --------
    if (
      intent === "hard_coding_logic" &&
      responseText === ""
    ) {
      const logic = await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: formattedMessages,
      });

      responseText =
        logic.choices[0]?.message?.content ||
        "No response.";
    }

    // -------- Casual Chat --------
    if (responseText === "") {
      const chat = await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: formattedMessages,
      });

      responseText =
        chat.choices[0]?.message?.content ||
        "No response.";
    }

    return res.json({
      text: responseText,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    console.error(err);

    return res.status(500).json({
      error: err.message || "Groq request failed",
    });
  }
});

// ---------------- Server ----------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
      },
      appType: "spa",
    });

    app.use(vite.middlewares);
  } else {
    const dist = path.join(process.cwd(), "dist");

    app.use(express.static(dist));

    app.get("*", (_, res) => {
      res.sendFile(path.join(dist, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();