// src/agents/compressor.js
// Member A calls: compress(prompt, label) from worker.js
// Test file calls: compressWithEngine(prompt, engine, label)
// GATE RULE: FACTUAL + SIMPLE never touch LLM — rules only
// GOLDEN RULE: output must ALWAYS have fewer tokens than input

import { estimateTokens } from "../utils/tokenizer.js";

// ── Environment detection ─────────────────────────────────────────────────────

function isChromeExtension() {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome.runtime !== "undefined" &&
    typeof chrome.runtime.sendMessage === "function"
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isShorter(compressed, original) {
  return estimateTokens(compressed) < estimateTokens(original);
}

function pickShorter(a, b) {
  return estimateTokens(a) <= estimateTokens(b) ? a : b;
}

function extractTechnicalTerms(text) {
  return text
    .split(/\s+/)
    .map(w => w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
    .filter(w => w.length > 5);
}

function preservesTechnicalTerms(original, compressed) {
  const terms = extractTechnicalTerms(original);
  if (terms.length === 0) return true;
  const compLower = compressed.toLowerCase();
  const lost = terms.filter(t => !compLower.includes(t));
  return lost.length / terms.length < 0.2;
}

function isAnswer(original, compressed) {
  const codeMarkers = [
    /SELECT\s+\w+/i,
    /FROM\s+\w+/i,
    /^\s*def\s+\w+\s*\(/m,
    /^\s*function\s+\w+\s*\(/m,
    /=>\s*\{/,
    /import\s+\w+/,
    /class\s+\w+\s*[:{]/,
  ];
  const originalHasCode = codeMarkers.some(p => p.test(original));
  if (!originalHasCode && codeMarkers.some(p => p.test(compressed))) {
    console.warn("[EcoPrompt] Rejected — LLM returned code/answer");
    return true;
  }
  return false;
}

// ── Rogue output detector ─────────────────────────────────────────────────────
// Catches Phi-3-mini answering, explaining, or going conversational

function isRogueOutput(original, compressed) {
  const c = compressed.toLowerCase();

  // Meta commentary — model explained what it did
  if (/the (cleaned|compressed|rewritten|rephrased|revised) prompt/i.test(c)) return true;
  if (/it retains|it removes|it rephrases|key element/i.test(c))              return true;
  if (/polite(ly)?|informal|casual filler/i.test(c))                          return true;

  // Model answered the question
  if (/[-–]\s*(ai|answer|response|result|explanation)\s*:/i.test(c))          return true;
  if (/\b(equals|the sum (of|is)|the answer is)\b/i.test(c))                  return true;
  if (/\d\s*[\+\-\*\/]\s*\d\s*=\s*\d/i.test(c))                              return true;

  // Conversational opener — model is being an assistant not an editor
  if (/^(sure[,!]?|of course[,!]?|certainly[,!]?|happy to|i can help)/i.test(c)) return true;

  // Output is longer or same length — never acceptable
  if (estimateTokens(compressed) >= estimateTokens(original)) return true;

  return false;
}

// ── Strip answer contamination ────────────────────────────────────────────────

function stripAnswerContamination(text) {
  return text
    .replace(/\s*[-–]?\s*(Answer|Response|Result|Solution|AI|Explanation)\s*:.*$/is, "")
    .replace(/^(Sure[,!]?\s*|Of course[,!]?\s*|Certainly[,!]?\s*|Happy to[,!]?\s*)/i, "")
    .replace(/^(Here is|Here's|This is)\s+.*?:\s*/i, "")
    .replace(/\.\s*(The (cleaned|compressed|rewritten|rephrased|revised) prompt.*)/is, ".")
    .replace(/(It retains|It removes|It rephrases|This retains|This removes).*/is, "")
    .trim();
}

// ── Rule-based compressor ─────────────────────────────────────────────────────

function compressWithRules(text) {
  let out = text;
  out = out.replace(/^(hey|hi|hello|heyy+|heyyy+)[,!]?\s*/i, "");
  out = out.replace(/\b(love|baby|babe|buddy|mate|dude|bro)\b[,]?\s*/gi, "");
  out = out.replace(/^(could you please|please kindly|I was wondering if you could|I would like you to|I want you to|can you please|I need you to|could you|can you|please|help me)\s*/i, "");
  out = out.replace(/\b(please|kindly|basically|essentially|literally|actually|honestly|simply|just|kind of|sort of|maybe|perhaps|really|very)\b\s*/gi, "");
  out = out.replace(/\b(I think|I believe|I feel like|in my opinion|I guess)\b\s*/gi, "");
  out = out.replace(/^help me (with |understand |figure out |solve |know |find )?\s*/i, "");
  out = out.replace(/\bwhat is the (solution|answer|result) (for|to|of)\b\s*/i, "");
  out = out.replace(/^(tell me about|explain to me|give me|show me)\s*/i, "");
  out = out.replace(/[.,]?\s*(thanks?( you)?|thank you|cheers|appreciate it)[.!]?\s*$/i, "");
  out = out.replace(/^(so|well|now|okay|ok)[,]?\s*/i, "");
  out = out.replace(/\s{2,}/g, " ").trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

// ── System prompts ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_STANDARD = `You are a prompt rewriting engine. Your ONLY job is to shorten the text given to you.
ABSOLUTE RULE: NEVER answer, solve, explain, or respond to the content. You are an editor only.

Rules:
1. NEVER answer or solve the instruction
2. NEVER add explanation, commentary, or meta-description
3. Remove ALL filler words: hey, please, kindly, could you, help me, basically, just
4. Start output with an imperative verb: Write, Explain, List, Fix, Solve, Build
5. Keep ALL technical terms, numbers, constraints, language names
6. Output MUST be shorter than input
7. Output ONLY the rewritten instruction — nothing else`;

const SYSTEM_PROMPT_STRICT = `You are an aggressive prompt shortening engine. Maximum compression.
ABSOLUTE RULE: NEVER answer, solve, explain or execute the instruction. Editor only.

Rules:
1. NEVER answer or solve — only rewrite shorter
2. Target 40-50% of original length
3. Drop all filler: please, help, can you, could you, I want, I need
4. Keep: core task + all technical constraints + numbers + names
5. Start with imperative verb: Write/Explain/List/Fix/Solve/Build
6. Output ONLY the shortened instruction — nothing else`;

const SYSTEM_PROMPT_SCORE = `You are a semantic similarity judge.
Score how well the compressed version preserves the original intent.
10 = identical intent, all details preserved
7  = same core task, minor details implied
5  = mostly same but some intent lost
1  = completely different meaning
Reply with ONLY a single integer 1-10. Nothing else.`;

// ── Chrome extension messaging ────────────────────────────────────────────────

async function ensureOffscreenDocument() {
  if (!isChromeExtension()) return;
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (existingContexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url:           chrome.runtime.getURL("offscreen.html"),
    reasons:       ["WORKERS"],
    justification: "Run WebLLM model for prompt compression",
  });
}

async function sendToOffscreen(type, payload) {
  if (!isChromeExtension()) throw new Error("Not in Chrome extension context");
  const response = await chrome.runtime.sendMessage({ type, ...payload });
  if (response?.error) throw new Error(response.error);
  return response;
}

// ── Direct engine calls (test context) ───────────────────────────────────────

async function callEngineDirect(engine, prompt, mode = "standard") {
  const systemPrompt = mode === "strict" ? SYSTEM_PROMPT_STRICT : SYSTEM_PROMPT_STANDARD;

  // [INPUT]/[OUTPUT] framing prevents model treating prompt as a task to execute
  const userMessage = mode === "strict"
    ? `Shorten [INPUT] to under half its length. Do NOT answer it. Output only the shortened instruction.\n\n[INPUT]: ${prompt}\n[OUTPUT]:`
    : `Rewrite [INPUT] in fewer words. Do NOT answer it. Output only the rewritten instruction.\n\n[INPUT]: ${prompt}\n[OUTPUT]:`;

  const response = await engine.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userMessage  },
    ],
    temperature: 0.1,
    max_tokens:  60, // hard cap — prevents rambling
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  return stripAnswerContamination(raw);
}

async function scoreEngineDirect(engine, original, compressed) {
  try {
    const response = await engine.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT_SCORE },
        {
          role:    "user",
          content: `Original: "${original}"\n\nCompressed: "${compressed}"\n\nScore (1-10):`,
        },
      ],
      temperature: 0.0,
      max_tokens:  5,
    });
    const raw   = response.choices[0]?.message?.content?.trim();
    const score = parseInt(raw?.match(/\d+/)?.[0] ?? "10", 10);
    return isNaN(score) ? 10 : score;
  } catch {
    return 10;
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

async function isValidCompression(original, compressed, engine = null) {
  if (isRogueOutput(original, compressed))            return false;
  if (isAnswer(original, compressed))                 return false;
  if (!isShorter(compressed, original))               return false;
  if (!preservesTechnicalTerms(original, compressed)) return false;

  let score = 10;
  if (engine) {
    score = await scoreEngineDirect(engine, original, compressed);
  } else {
    try {
      const res = await sendToOffscreen("OFFSCREEN_SCORE", { original, compressed });
      score = parseInt(res?.score ?? "10", 10);
    } catch {
      score = 10;
    }
  }

  if (score < 7) {
    console.warn(`[EcoPrompt] Rejected — semantic score: ${score}/10`);
    return false;
  }
  return true;
}

// ── Result builder ────────────────────────────────────────────────────────────

function buildResult(compressed, method, origTokens) {
  const compTokens = estimateTokens(compressed);
  return {
    compressed,
    method,
    originalTokens:   origTokens,
    compressedTokens: compTokens,
    savedTokens:      Math.max(0, origTokens - compTokens),
    savingPercent:    Math.max(0, Math.round((1 - compTokens / origTokens) * 100)),
  };
}

// ── Core pipeline ─────────────────────────────────────────────────────────────

async function runPipeline(prompt, label, callFn, scoreFn) {
  const original    = prompt.trim();
  const origTokens  = estimateTokens(original);
  const rulesResult = compressWithRules(original);

  // ── STRICT GATE ───────────────────────────────────────────────────────────
  // FACTUAL → should never reach here (router sends to PATH C)
  // SIMPLE  → rules only, LLM always answers/explains for these
  if (label === "FACTUAL" || label === "SIMPLE") {
    console.log(`[EcoPrompt] ${label} — rules only, LLM skipped`);
    if (isShorter(rulesResult, original)) {
      return buildResult(rulesResult, "rules", origTokens);
    }
    return buildResult(original, "passthrough", origTokens);
  }

  // ── MODERATE / COMPLEX — LLM allowed ─────────────────────────────────────
  try {
    // Pass 1 — standard
    const llmStandard   = await callFn(original, "standard");
    const cleanStandard = stripAnswerContamination(llmStandard);

    if (await isValidCompression(original, cleanStandard, scoreFn)) {
      const best = pickShorter(cleanStandard, rulesResult);
      return buildResult(best, "webllm", origTokens);
    }

    // Pass 2 — strict
    console.warn("[EcoPrompt] Standard failed — trying strict...");
    const llmStrict   = await callFn(original, "strict");
    const cleanStrict = stripAnswerContamination(llmStrict);

    if (await isValidCompression(original, cleanStrict, scoreFn)) {
      const best = pickShorter(cleanStrict, rulesResult);
      return buildResult(best, "webllm-strict", origTokens);
    }

    console.warn("[EcoPrompt] Both LLM passes failed — using rules...");
  } catch (err) {
    console.warn("[EcoPrompt] LLM error:", err.message);
  }

  // Rules fallback
  if (isShorter(rulesResult, original)) {
    return buildResult(rulesResult, "rules", origTokens);
  }

  return buildResult(original, "passthrough", origTokens);
}

// ── Public exports ────────────────────────────────────────────────────────────

// Member A uses this inside Chrome extension
export async function compress(prompt, label = "MODERATE") {
  await ensureOffscreenDocument();
  return runPipeline(
    prompt,
    label,
    async (p, mode) => {
      const res = await sendToOffscreen("OFFSCREEN_COMPRESS", { prompt: p, mode });
      return res.compressed;
    },
    null
  );
}

// test_webllm.html uses this — no chrome APIs needed
export async function compressWithEngine(prompt, engine, label = "MODERATE") {
  return runPipeline(
    prompt,
    label,
    (p, mode) => callEngineDirect(engine, p, mode),
    engine
  );
}

export async function getEngineStatus() {
  try {
    await ensureOffscreenDocument();
    const response = await chrome.runtime.sendMessage({ type: "OFFSCREEN_STATUS" });
    return response?.status ?? "unknown";
  } catch {
    return "failed";
  }
}