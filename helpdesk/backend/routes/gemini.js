const express = require("express");
const router = express.Router();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

/**
 * POST /api/gemini/chat
 * Body: { messages: [{ role, content }], systemPrompt: string }
 * Proxies chat to Gemini and returns AI response text
 */
router.post("/chat", async (req, res) => {
  try {
    const { messages, systemPrompt } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required" });
    }

    // Build Gemini request: system instruction + conversation history
    const contents = messages.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    const body = {
      contents,
      systemInstruction: {
        parts: [{ text: systemPrompt || "You are a helpful assistant." }],
      },
      generationConfig: {
        maxOutputTokens: 800,
        temperature: 0.7,
      },
    };

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errData = await response.text();
      console.error("Gemini API error:", response.status, errData);
      return res.status(response.status).json({ error: `Gemini API error: ${response.status}` });
    }

    const data = await response.json();
    const reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "I encountered an issue processing your request. Please try again.";

    res.json({ reply });
  } catch (err) {
    console.error("Gemini chat error:", err);
    res.status(500).json({ error: "Failed to get AI response" });
  }
});

/**
 * POST /api/gemini/categorize
 * Body: { description: string }
 * Uses Gemini to intelligently categorize and prioritize a ticket
 */
router.post("/categorize", async (req, res) => {
  try {
    const { description } = req.body;

    if (!description) {
      return res.status(400).json({ error: "description is required" });
    }

    const systemPrompt = `You are an IT helpdesk AI that categorizes support tickets for POWERGRID Corporation.
Given a user's issue description, respond with ONLY a JSON object (no markdown, no code fences) with these fields:
- "category": one of "access", "hardware", "software", "network", "email", "other"
- "priority": one of "low", "medium", "high", "critical"
- "title": a concise professional ticket title (max 60 chars)
- "summary": a brief 1-2 sentence professional summary of the issue

Example response:
{"category":"network","priority":"high","title":"WiFi Connectivity Failure in Office Block","summary":"User reports complete WiFi connectivity loss affecting work productivity. Requires immediate network team investigation."}`;

    const body = {
      contents: [
        {
          role: "user",
          parts: [{ text: description }],
        },
      ],
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      generationConfig: {
        maxOutputTokens: 300,
        temperature: 0.3,
      },
    };

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: "Gemini API error" });
    }

    const data = await response.json();
    const rawText =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    // Parse the JSON from Gemini's response
    let result;
    try {
      // Strip any markdown code fences if present
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      result = JSON.parse(cleaned);
    } catch {
      result = {
        category: "other",
        priority: "medium",
        title: "IT Support Request",
        summary: description,
      };
    }

    res.json(result);
  } catch (err) {
    console.error("Gemini categorize error:", err);
    res.status(500).json({ error: "Failed to categorize ticket" });
  }
});

module.exports = router;
