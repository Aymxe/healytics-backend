const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { verifyToken } = require('../middleware/auth');
const db = require('../config/db');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BASE_SYSTEM_PROMPT = `You are Healytics AI, a helpful medical assistant embedded in the Healytics healthcare platform. Your role is to:
1. Listen to the patient's symptoms carefully
2. Ask clarifying questions if needed (duration, severity, location, age)
3. Recommend ONE specific doctor from the Healytics doctors list provided below (by name and specialty)
4. Indicate urgency: 🔴 Urgent (go to ER now), 🟡 Soon (within 24-48h), 🟢 Routine (schedule appointment)
5. Give brief, clear advice

IMPORTANT rules:
- Always end with: "⚠️ This is not a medical diagnosis. Please consult a licensed doctor."
- Never prescribe medications
- For chest pain, difficulty breathing, stroke symptoms → always say 🔴 Urgent / go to ER immediately
- Keep responses concise (3-5 sentences max)
- Respond in the same language the patient uses (Arabic or English)
- When you recommend a specific doctor, add on the very last line (no other text after it): BOOK_DOCTOR:[DoctorID]
  where [DoctorID] is the exact ID from the list below. Only include this tag when you are ready to recommend booking.`;

router.post('/', verifyToken, async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ message: 'Messages array is required.' });
  }

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
    return res.status(503).json({ message: 'AI service not configured. Please contact support.' });
  }

  try {
    const [doctors] = await db.query(
      "SELECT DoctorID, Name, Specialty FROM doctors WHERE Availability = 'Available' LIMIT 20"
    );

    const doctorList = doctors.length > 0
      ? doctors.map(d => `• ${d.Name} (${d.Specialty}) — ID: ${d.DoctorID}`).join('\n')
      : 'No doctors currently available — advise the patient to visit the ER or call support.';

    const systemPrompt = `${BASE_SYSTEM_PROMPT}

Available doctors in Healytics right now:
${doctorList}`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role === 'bot' ? 'assistant' : 'user',
        content: m.text,
      })),
    });

    let reply = response.content[0]?.text || 'Sorry, I could not process your request.';
    let recommendedDoctorID = null;
    let recommendedDoctorName = null;

    const match = reply.match(/BOOK_DOCTOR:(\w+)/);
    if (match) {
      recommendedDoctorID = match[1];
      reply = reply.replace(/\nBOOK_DOCTOR:\w+/, '').replace(/BOOK_DOCTOR:\w+/, '').trim();
      const doc = doctors.find(d => d.DoctorID === recommendedDoctorID);
      if (doc) {
        recommendedDoctorName = doc.Name;
      } else {
        recommendedDoctorID = null;
      }
    }

    res.status(200).json({ reply, recommendedDoctorID, recommendedDoctorName });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ message: 'AI service error. Please try again.' });
  }
});

module.exports = router;
