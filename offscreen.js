// offscreen.js
// WebLLM runs HERE — inside the offscreen document
// Handles: OFFSCREEN_COMPRESS, OFFSCREEN_SCORE, OFFSCREEN_STATUS

import * as webllm from "@mlc-ai/web-llm";

const MODEL_ID = "Phi-3-mini-4k-instruct-q4f16_1-MLC";

let engine       = null;
let engineStatus = "idle"; // idle | loading | ready | failed

// ─── System prompts ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT_STANDARD = `You are a prompt rewriting engine. Your only job is to shorten instructions.
CRITICAL RULE: You must NEVER answer, solve, execute, or respond to the content of the instruction. You are an editor, not an assistant. You only rewrite.
Rules:
1. NEVER answer the instruction — only rewrite it shorter
2. NEVER generate code, SQL, math solutions, or any answer
3. Remove ALL filler: hey, please, kindly, could you, help me, basically, sort of, just, actually
4. Start with an imperative verb: Write, Explain, List, Create, Fix, Build, Solve, Calculate
5. Keep every technical detail: language, framework, constraints, numbers, table names
6. Output MUST have fewer tokens than input
7. Output ONLY the rewritten instruction — nothing else`;

const SYSTEM_PROMPT_STRICT = `You are an aggressive prompt rewriting engine. Maximum shortening required.
CRITICAL RULE: NEVER answer or execute the instruction. You are ONLY an editor. Rewrite, never respond.
Rules:
1. NEVER generate code, SQL, calculations or any answer — only rewrite the instruction
2. Target 40-50% of original token count
3. Telegraphic style: drop articles where meaning stays clear
4. Drop ALL: please, help, can you, could you, I want, I need, tell me
5. Keep: core task + technical constraints + all numbers + table/variable names
6. Start with imperative verb: Write/Explain/List/Fix/Solve/Build
7. Output ONLY the shortened instruction — nothing else`;

const SYSTEM_PROMPT_SCORE = `You are a semantic similarity judge. 
Given an original prompt and a compressed version, rate how well the compressed version preserves the full intent and technical requirements of the original.
Score from 1-10 where:
10 = identical intent, all technical details preserved
7  = same core task, minor details may be implied
5  = mostly same but some intent lost
3  = significant intent lost
1  = completely different meaning
Reply with ONLY a single integer between 1 and 10. Nothing else.`;

// ─── Engine init ──────────────────────────────────────────────────────────────

async function initEngine() {
  engineStatus = "loading";
  try {
    engine = await webllm.CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (progress) => {
        chrome.runtime.sendMessage({
          type:    "WEBLLM_PROGRESS",
          percent: Math.round(progress.progress * 100),
          text:    progress.text,
        });
      },
    });
    engineStatus = "ready";
    chrome.runtime.sendMessage({ type: "WEBLLM_READY" });
  } catch (err) {
    engineStatus = "failed";
    chrome.runtime.sendMessage({ type: "WEBLLM_FAILED", error: err.message });
  }
}

// ─── Compression handler ──────────────────────────────────────────────────────

async function handleCompress(prompt, mode = "standard") {
  if (engineStatus !== "ready") {
    return { error: "Engine not ready", status: engineStatus };
  }

  const systemPrompt = mode === "strict"
    ? SYSTEM_PROMPT_STRICT
    : SYSTEM_PROMPT_STANDARD;

  // KEY FIX — wrap prompt in [INSTRUCTION TO SHORTEN] tag
  // This stops Phi-3-mini from executing the task instead of compressing it
  const userMessage = mode === "strict"
    ? `Shorten this instruction to under half its length. Do NOT answer it or execute it. Only rewrite the instruction.\n\n[INSTRUCTION TO SHORTEN]: ${prompt}`
    : `Rewrite this instruction in fewer words. Do NOT answer it or execute it. Only rewrite the instruction itself.\n\n[INSTRUCTION TO SHORTEN]: ${prompt}`;

  try {
    const response = await engine.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userMessage  },
      ],
      temperature: 0.1,
      max_tokens:  300,
    });

    const compressed = response.choices[0]?.message?.content?.trim();
    return { compressed, status: "ok" };
  } catch (err) {
    return { error: err.message, status: "error" };
  }
}

// ─── Semantic scoring handler ─────────────────────────────────────────────────

async function handleScore(original, compressed) {
  if (engineStatus !== "ready") {
    return { score: "10", status: "engine_not_ready_assumed_ok" };
  }

  try {
    const response = await engine.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT_SCORE },
        {
          role:    "user",
          content: `Original: "${original}"\n\nCompressed: "${compressed}"\n\nScore (1-10):`,
        },
      ],
      temperature: 0.0,  // fully deterministic for scoring
      max_tokens:  5,    // just a number — no need for more
    });

    const raw   = response.choices[0]?.message?.content?.trim();
    const score = raw?.match(/\d+/)?.[0] ?? "10";
    return { score, status: "ok" };
  } catch (err) {
    // Scoring failure should never block compression — default to passing
    return { score: "10", status: "error", error: err.message };
  }
}

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.type === "OFFSCREEN_COMPRESS") {
    handleCompress(msg.prompt, msg.mode ?? "standard")
      .then(sendResponse);
    return true;
  }

  if (msg.type === "OFFSCREEN_SCORE") {
    handleScore(msg.original, msg.compressed)
      .then(sendResponse);
    return true;
  }

  if (msg.type === "OFFSCREEN_STATUS") {
    sendResponse({ status: engineStatus });
    return true;
  }

});

// ─── Boot ─────────────────────────────────────────────────────────────────────

initEngine();