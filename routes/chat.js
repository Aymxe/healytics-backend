const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { verifyToken } = require('../middleware/auth');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are Healytics AI, a helpful medical assistant. Your role is to:
1. Listen to the patient's symptoms carefully
2. Ask clarifying questions if needed (duration, severity, location, age)
3. Suggest the most appropriate medical specialty to consult
4. Indicate urgency: 🔴 Urgent (go to ER now), 🟡 Soon (within 24-48h), 🟢 Routine (schedule appointment)
5. Give brief, clear advice

IMPORTANT rules:
- Always end with: "⚠️ This is not a medical diagnosis. Please consult a licensed doctor."
- Never prescribe medications
- For chest pain, difficulty breathing, stroke symptoms → always say 🔴 Urgent / go to ER immediately
- Keep responses concise (3-5 sentences max)
- Respond in the same language the patient uses (Arabic or English)`;

router.post('/', verifyToken, async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ message: 'Messages array is required.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ message: 'AI service not configured. Please add ANTHROPIC_API_KEY to .env' });
  }

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: messages.map((m) => ({
        role: m.role === 'bot' ? 'assistant' : 'user',
        content: m.text,
      })),
    });

    const reply = response.content[0]?.text || 'Sorry, I could not process your request.';
    res.status(200).json({ reply });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ message: 'AI service error. Please try again.' });
  }
});

module.exports = router;
