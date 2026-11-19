import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const PORT = 3000;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '6mb' }));

  app.get('/api/health', (_req, res) => {
    const ai = getGeminiClient();
    res.json({ ok: true, aiConfigured: Boolean(ai) });
  });

  app.post('/api/interpret-prompt', async (req, res) => {
    const { prompt, worldContext } = req.body ?? {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt string is required.' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(200).json({
        aiUsed: false,
        plan: null,
        reason: 'GEMINI_API_KEY not configured; using deterministic parser.',
      });
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `You are the AI Command & Narrative Director for WORLD // OBSERVER (a 2D social sandbox simulation).
Current world context:
${JSON.stringify(worldContext ?? {}, null, 2)}

User natural-language directive:
"${prompt}"

Translate this instruction into a single validated StructuredCommandProposal JSON object.
Allowed intents:
- CONFRONT_TARGET: mobilize actors to surround & confront a target peep
- DIRECT_ESPIONAGE: actor secretly follows/spies on target, investigates, optionally reports to secondaryTargetSelector
- COVERT_THEFT: actor moves to shop/market and steals
- COVERT_SABOTAGE: actor moves to cafe and sabotages food supply
- ATTACK_TARGET: actor attacks target peep
- START_BRAWL: group brawl in plaza
- PROTECT_TARGET: guard/protect a peep
- ARREST_TARGET: detain/arrest a peep
- MOVE_AND_ACT: move actor(s) to landmark and watch_tv/worship/hide
- CRT_BROADCAST: change what is displayed on the Central Broadcast CRT
- CHANGE_WEATHER: HAZY, CLEAR, RAIN, ASH_STORM
- FOOD_SHORTAGE: trigger scarcity
- MASS_PANIC: panic/flee
- MASS_CELEBRATE: celebrate
- BEHAVIOR_SHIFT: adjust suspicion/fear/aggression toward a target
- SPAWN_CHARACTER: introduce a stranger/character
- SPREAD_RUMOR: seed a rumor

Allowed actionChain verbs: move_to, follow, surround, confront, flee, attack, protect, steal, sabotage, spy, whisper_rumor, investigate, arrest, worship, watch_tv, hide, celebrate, report.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              intent: { type: Type.STRING },
              summary: { type: Type.STRING },
              actorSelector: { type: Type.STRING },
              actorCount: { type: Type.INTEGER },
              targetSelector: { type: Type.STRING },
              secondaryTargetSelector: { type: Type.STRING },
              locationSelector: { type: Type.STRING },
              actionChain: { type: Type.ARRAY, items: { type: Type.STRING } },
              emotionalShift: { type: Type.STRING },
              crtBroadcast: { type: Type.STRING },
              rumorText: { type: Type.STRING },
              weather: { type: Type.STRING },
              foodSupplyDelta: { type: Type.INTEGER },
              tensionDelta: { type: Type.INTEGER },
              spawnNewActors: { type: Type.BOOLEAN },
              spawnName: { type: Type.STRING },
              spawnRole: { type: Type.STRING },
            },
            required: ['intent', 'summary'],
          },
        },
      });

      const raw = (response.text ?? '').trim();
      const parsed = JSON.parse(raw);
      return res.json({ aiUsed: true, proposal: parsed });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI request failed';
      return res.status(200).json({ aiUsed: false, proposal: null, reason: msg });
    }
  });

  app.post('/api/dialogue', async (req, res) => {
    const { speakerA, speakerB, worldSummary, relationship } = req.body ?? {};
    const ai = getGeminiClient();
    if (!ai || !speakerA || !speakerB) {
      return res.json({ aiUsed: false, lines: null });
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Generate a terse, atmospheric 2-line pixel-bubble exchange (max 7 words per line) between two characters in WORLD // OBSERVER.
Speaker A: ${speakerA.name} (${speakerA.role}, emotion ${speakerA.emotion}, traits ${JSON.stringify(speakerA.personality)})
Speaker B: ${speakerB.name} (${speakerB.role}, emotion ${speakerB.emotion}, traits ${JSON.stringify(speakerB.personality)})
Relationship: ${relationship?.label ?? 'Stranger'} (affinity ${relationship?.affinity ?? 0})
World context: ${JSON.stringify(worldSummary ?? {})}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              lineA: { type: Type.STRING },
              lineB: { type: Type.STRING },
              affinityDelta: { type: Type.INTEGER },
              memorySummary: { type: Type.STRING },
            },
            required: ['lineA', 'lineB'],
          },
        },
      });
      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json({ aiUsed: true, dialogue: parsed });
    } catch {
      return res.json({ aiUsed: false, dialogue: null });
    }
  });

  app.post('/api/analyze-image', async (req, res) => {
    const { imageBase64, mimeType, prompt } = req.body ?? {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'imageBase64 is required' });
    }
    const ai = getGeminiClient();
    if (!ai) {
      return res.json({ aiUsed: false, analysis: null });
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'image/png',
                data: imageBase64,
              },
            },
            {
              text: `Analyze this uploaded image for WORLD // OBSERVER (a gritty desaturated 2D pixel-art social sandbox).
User note: "${prompt || 'Translate this visual into an inhabitant'}"
Extract character traits as JSON:
- name (short atmospheric name)
- role (uppercase 1-2 word role like CITIZEN, MERCHANT, WATCHER, SCHOLAR, STRANGER)
- headShape ("round" | "square" | "pet")
- accessory ("none" | "tophat" | "cap" | "glasses" | "scarf" | "crown")
- emotion ("CALM" | "CURIOUS" | "HAPPY" | "ANGRY" | "SUSPICIOUS" | "INSPIRED")
- description (1 concise sentence describing visual appearance & vibe)
- introversion, empathy, aggression, curiosity, ambition (integers 0..100)`,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              role: { type: Type.STRING },
              headShape: { type: Type.STRING },
              accessory: { type: Type.STRING },
              emotion: { type: Type.STRING },
              description: { type: Type.STRING },
              introversion: { type: Type.INTEGER },
              empathy: { type: Type.INTEGER },
              aggression: { type: Type.INTEGER },
              curiosity: { type: Type.INTEGER },
              ambition: { type: Type.INTEGER },
            },
            required: ['name', 'role', 'headShape', 'accessory', 'description'],
          },
        },
      });
      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json({ aiUsed: true, analysis: parsed });
    } catch {
      return res.json({ aiUsed: false, analysis: null });
    }
  });

  app.post('/api/summarize-logs', async (req, res) => {
    const { journal, worldName, day } = req.body ?? {};
    const ai = getGeminiClient();
    if (!ai) {
      return res.json({ aiUsed: false, summary: null });
    }
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Write a concise, moody 3-sentence observer chronicle summarizing recent events in "${worldName}" on Day ${day}.
Logs: ${JSON.stringify((journal ?? []).slice(0, 12))}`,
      });
      return res.json({ aiUsed: true, summary: (response.text ?? '').trim() });
    } catch {
      return res.json({ aiUsed: false, summary: null });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distPath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WORLD // OBSERVER server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
