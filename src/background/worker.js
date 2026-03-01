// src/background/worker.js
// Central message bus. Coordinates all agents.

import { calculateSavings } from '../utils/carbon.js';

// ── Boilerplate stubs (replace when teammates deliver real implementations) ──

async function classifyPrompt(prompt) {
  // TODO: Member B replaces this with real classifier
  // Returns: 'FACTUAL' | 'KNOWLEDGE' | 'REASONING'
  return 'KNOWLEDGE'; // stub — always compresses
}

async function compressPrompt(prompt, classification) {
  // TODO: Member B replaces this with WebLLM call via offscreen doc
  // Simulates compression by trimming filler words
  await new Promise(r => setTimeout(r, 800)); // fake latency
  const compressed = prompt
    .replace(/\bplease\b/gi, '')
    .replace(/\bcould you\b/gi, '')
    .replace(/\bI was wondering if\b/gi, '')
    .replace(/\bwould you be able to\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return compressed;
}

async function signInWithGoogle() {
  // TODO: Member C replaces with real Firebase Auth
  return { uid: 'stub-uid-123', email: 'user@example.com' };
}

async function saveToFirestore(uid, stats) {
  // TODO: Member C replaces with real Firestore write
  console.log('[EcoPrompt] Would save to Firestore:', uid, stats);
}

async function fetchFromFirestore(uid) {
  // TODO: Member C replaces with real Firestore fetch
  return { totalCo2Grams: 42.5, totalTokensSaved: 18400, promptsCompressed: 37 };
}

// ── Session state (in-memory, resets on browser restart) ──────────────────────

let sessionStats = {
  co2Grams:          0,
  waterMl:           0,
  whSaved:           0,
  tokensSaved:       0,
  promptsCompressed: 0,
  savingsPct:        0,
  equiv: { treeDays: 0, carMiles: 0, smartphoneCharges: 0 },
};

let currentUser  = null;
let modelReady   = false; // flipped to true when Member B's WebLLM is ready

// ── Message handler ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse);
  return true; // keep channel open for async
});

async function handleMessage(msg, sender) {
  switch (msg.type) {

    case 'PROMPT_INTERCEPTED': {
      const { prompt, site } = msg;

      // 1. Classify
      const classification = await classifyPrompt(prompt);

      // 2. Compress
      const compressed = await compressPrompt(prompt, classification);

      // 3. Carbon math
      const model = inferModel(site);
      const originalTokens   = estimateTokens(prompt);
      const compressedTokens = estimateTokens(compressed);
      const stats = calculateSavings(originalTokens, compressedTokens, model);

      // 4. Send overlay back to content script
      chrome.tabs.sendMessage(sender.tab.id, {
        type:       'SHOW_COMPRESSED_OVERLAY',
        original:   prompt,
        compressed: compressed,
        stats:      stats,
      });

      return { ok: true };
    }

    case 'USER_ACCEPTED_COMPRESSION': {
      const { stats } = msg;
      accumulateSession(stats);

      // Save to Firestore if logged in
      if (currentUser) {
        await saveToFirestore(currentUser.uid, sessionStats);
      }

      return { ok: true };
    }

    case 'USER_REJECTED_COMPRESSION': {
      // User chose original — no stats update
      return { ok: true };
    }

    case 'GET_LIFETIME_STATS': {
      let lifetime = null;
      if (currentUser) {
        lifetime = await fetchFromFirestore(currentUser.uid);
      }
      return { session: sessionStats, lifetime, user: currentUser };
    }

    case 'MODEL_STATUS': {
      return { ready: modelReady };
    }

    case 'MODEL_READY': {
      // Member B's WebLLM fires this when model is loaded
      modelReady = true;
      return { ok: true };
    }

    case 'GOOGLE_SIGNIN': {
      currentUser = await signInWithGoogle();
      return { user: currentUser };
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function accumulateSession(stats) {
  sessionStats.co2Grams          += stats.co2Grams;
  sessionStats.waterMl           += stats.waterMl;
  sessionStats.whSaved           += stats.whSaved;
  sessionStats.tokensSaved       += stats.tokensSaved;
  sessionStats.promptsCompressed += 1;
  sessionStats.savingsPct         = Math.round(
    (sessionStats.tokensSaved /
      (sessionStats.tokensSaved + (stats.originalTokens * sessionStats.promptsCompressed))) * 100
  );
  sessionStats.equiv.treeDays          += stats.equiv.treeDays;
  sessionStats.equiv.carMiles          += stats.equiv.carMiles;
  sessionStats.equiv.smartphoneCharges += stats.equiv.smartphoneCharges;
}

function inferModel(site) {
  const map = {
    'chatgpt.com':        'gpt-4',
    'chat.openai.com':    'gpt-4',
    'claude.ai':          'claude-sonnet',
    'gemini.google.com':  'gemini-pro',
    'grok.com':           'gpt-4', // approximate
  };
  return map[site] ?? 'claude-haiku';
}

function estimateTokens(text) {
  // Rough BPE estimate: 1 token ≈ 0.75 words ≈ 4 chars
  return Math.ceil(text.length / 4);
}