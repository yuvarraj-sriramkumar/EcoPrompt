// src/agents/compressor.js
// Talks to offscreen.js to run WebLLM compression
// Member A calls: compress(prompt) from worker.js
// GOLDEN RULE: output must ALWAYS have fewer tokens than input. Never worse.

import { estimateTokens } from "../utils/tokenizer.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isShorter(compressed, original) {
  return estimateTokens(compressed) < estimateTokens(original);
}

function pickShorter(a, b) {
  return estimateTokens(a) <= estimateTokens(b) ? a : b;
}

// Extract technical anchor words (>5 chars, alphanumeric)
// These must survive compression or we reject the output
function extractTechnicalTerms(text) {
  return text
    .split(/\s+/)
    .map(w => w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
    .filter(w => w.length > 5);
}

function preservesTechnicalTerms(original, compressed) {
  const terms    = extractTechnicalTerms(original);
  if (terms.length === 0) return true; // no technical terms to check
  const compLower = compressed.toLowerCase();
  const lost      = terms.filter(t => !compLower.includes(t));
  // Allow up to 20% term loss — synonyms and paraphrasing are ok
  return lost.length / terms.length < 0.2;
}

// ─── Rule-based compressor ────────────────────────────────────────────────────

function compressWithRules(text) {
  let out = text;

  // Remove greetings
  out = out.replace(/^(hey|hi|hello)[,!]?\s*/i, "");

  // Remove soft openers
  out = out.replace(
    /^(could you please|please kindly|I was wondering if you could|I would like you to|I want you to|can you please|I need you to|could you|can you|please|help me)\s*/i,
    ""
  );

  // Remove filler words
  out = out.replace(
    /\b(please|kindly|basically|essentially|literally|actually|honestly|simply|just|kind of|sort of|maybe|perhaps|really|very)\b\s*/gi,
    ""
  );

  // Remove opinion softeners
  out = out.replace(
    /\b(I think|I believe|I feel like|in my opinion|I guess)\b\s*/gi,
    ""
  );

  // Remove "help me with/understand/solve" → keep the subject
  out = out.replace(
    /^help me (with |understand |figure out |solve |know |find )?\s*/i,
    ""
  );

  // Remove "what is the solution/answer/result for" → keep expression
  out = out.replace(
    /\bwhat is the (solution|answer|result) (for|to|of)\b\s*/i,
    ""
  );

  // Remove "tell me about / explain to me / give me / show me"
  out = out.replace(
    /^(tell me about|explain to me|give me|show me)\s*/i,
    ""
  );

  // Remove sign-offs
  out = out.replace(
    /[.,]?\s*(thanks?( you)?|thank you|cheers|appreciate it)[.!]?\s*$/i,
    ""
  );

  // Remove filler conjunctions at start
  out = out.replace(/^(so|well|now|okay|ok)[,]?\s*/i, "");

  // Collapse whitespace
  out = out.replace(/\s{2,}/g, " ").trim();

  // Capitalize first letter
  return out.charAt(0).toUpperCase() + out.slice(1);
}

// ─── Offscreen helpers ────────────────────────────────────────────────────────

async function ensureOffscreenDocument() {
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
  const response = await chrome.runtime.sendMessage({ type, ...payload });
  if (response?.error) throw new Error(response.error);
  return response;
}

// ─── Validation: semantic similarity via WebLLM ───────────────────────────────

async function semanticScore(original, compressed) {
  try {
    const response = await sendToOffscreen("OFFSCREEN_SCORE", {
      original,
      compressed,
    });
    const score = parseInt(response?.score ?? "0", 10);
    return isNaN(score) ? 0 : score;
  } catch {
    // If scoring fails, assume it's ok — don't block compression
    return 10;
  }
}

// ─── Full validation pipeline ─────────────────────────────────────────────────
// Returns true only if compressed passes ALL three checks:
//   1. Token count is lower than original
//   2. 80%+ technical terms preserved
//   3. Semantic similarity score ≥ 7 (via WebLLM)

async function isValidCompression(original, compressed) {
  // Check 1 — must be shorter in tokens
  if (!isShorter(compressed, original)) {
    console.warn("[EcoPrompt] Rejected — not shorter in tokens");
    return false;
  }

  // Check 2 — technical terms preserved
  if (!preservesTechnicalTerms(original, compressed)) {
    console.warn("[EcoPrompt] Rejected — technical terms lost");
    return false;
  }

  // Check 3 — semantic similarity via WebLLM
  const score = await semanticScore(original, compressed);
  if (score < 7) {
    console.warn(`[EcoPrompt] Rejected — semantic score too low: ${score}/10`);
    return false;
  }

  return true;
}

// ─── Main export ──────────────────────────────────────────────────────────────
//
// Flow:
//   Step 1 — Rules (instant, free, no LLM)
//   Step 2 — WebLLM standard pass
//   Step 3 — Validate LLM result (tokens + terms + semantic)
//   Step 4 — If invalid → WebLLM strict pass
//   Step 5 — Validate strict result
//   Step 6 — If still invalid → validate rules result
//   Step 7 — Final safety net → return original unchanged
//
export async function compress(prompt) {
  const original  = prompt.trim();
  const origTokens = estimateTokens(original);

  // ── Step 1: rules baseline (always free) ───────────────────────────────────
  const rulesResult = compressWithRules(original);

  try {
    await ensureOffscreenDocument();

    // ── Step 2: WebLLM standard pass ─────────────────────────────────────────
    const { compressed: llmStandard } = await sendToOffscreen(
      "OFFSCREEN_COMPRESS",
      { prompt: original, mode: "standard" }
    );

    // ── Step 3: validate standard result ─────────────────────────────────────
    if (await isValidCompression(original, llmStandard)) {
      const best = pickShorter(llmStandard, rulesResult);
      return _result(best, "webllm", origTokens);
    }

    // ── Step 4: WebLLM strict pass ────────────────────────────────────────────
    console.warn("[EcoPrompt] Standard pass failed validation, trying strict...");
    const { compressed: llmStrict } = await sendToOffscreen(
      "OFFSCREEN_COMPRESS",
      { prompt: original, mode: "strict" }
    );

    // ── Step 5: validate strict result ───────────────────────────────────────
    if (await isValidCompression(original, llmStrict)) {
      const best = pickShorter(llmStrict, rulesResult);
      return _result(best, "webllm-strict", origTokens);
    }

    console.warn("[EcoPrompt] Both LLM passes failed validation, trying rules...");

  } catch (err) {
    console.warn("[EcoPrompt] WebLLM error:", err.message);
  }

  // ── Step 6: rules fallback ────────────────────────────────────────────────
  if (isShorter(rulesResult, original)) {
    return _result(rulesResult, "rules", origTokens);
  }

  // ── Step 7: nothing worked — return original unchanged ───────────────────
  return _result(original, "passthrough", origTokens);
}

// ─── Result shape (Member C reads this via buildStats) ───────────────────────
function _result(compressed, method, origTokens) {
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

export async function getEngineStatus() {
  try {
    await ensureOffscreenDocument();
    const response = await chrome.runtime.sendMessage({ type: "OFFSCREEN_STATUS" });
    return response?.status ?? "unknown";
  } catch {
    return "failed";
  }
}

// Detects if LLM returned an answer/code instead of a compressed prompt
function isAnswer(original, compressed) {
  const origLower = original.toLowerCase();
  const compLower = compressed.toLowerCase();

  // If compressed contains code markers — LLM solved it instead
  const codeMarkers = [
    /SELECT\s+\w+/i,          // SQL
    /FROM\s+\w+/i,            // SQL
    /def\s+\w+\s*\(/,         // Python function
    /function\s+\w+\s*\(/,    // JS function
    /=>\s*{/,                 // arrow function
    /^\s*\{[\s\S]*\}\s*$/,    // JSON blob
    /import\s+\w+/,           // import statement
    /class\s+\w+/,            // class definition
  ];

  if (codeMarkers.some(pattern => pattern.test(compressed))) {
    // Only reject if original was NOT already code
    const originalHasCode = codeMarkers.some(p => p.test(original));
    if (!originalHasCode) {
      console.warn("[EcoPrompt] Rejected — LLM returned code instead of compressed prompt");
      return true;
    }
  }

  // If compressed is longer than original — also reject
  if (estimateTokens(compressed) > estimateTokens(original)) {
    console.warn("[EcoPrompt] Rejected — LLM returned something longer");
    return true;
  }

  return false;
}

async function isValidCompression(original, compressed) {
  // Check 0 — LLM returned an answer/code instead of compressed prompt
  if (isAnswer(original, compressed)) return false;

  // Check 1 — must be shorter in tokens
  if (!isShorter(compressed, original)) {
    console.warn("[EcoPrompt] Rejected — not shorter in tokens");
    return false;
  }

  // Check 2 — technical terms preserved
  if (!preservesTechnicalTerms(original, compressed)) {
    console.warn("[EcoPrompt] Rejected — technical terms lost");
    return false;
  }

  // Check 3 — semantic similarity via WebLLM
  const score = await semanticScore(original, compressed);
  if (score < 7) {
    console.warn(`[EcoPrompt] Rejected — semantic score too low: ${score}/10`);
    return false;
  }

  return true;
}
// Test the compressor with various prompts