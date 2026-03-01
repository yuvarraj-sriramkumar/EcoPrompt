// src/background/worker.js

import { classify }          from '../agents/classifier.js';
import { route }             from '../agents/router.js';
import { compress, getEngineStatus } from '../agents/compressor.js';
import { calculateSavings }  from '../utils/carbon.js';
import { searchGoogle }      from '../agents/skipAI.js';

// ── Session state ──────────────────────────────────────────────────────────────

let sessionStats = {
  co2Grams:          0,
  waterMl:           0,
  whSaved:           0,
  tokensSaved:       0,
  promptsCompressed: 0,
  savingsPct:        0,
  equiv: { treeDays: 0, carMiles: 0, smartphoneCharges: 0 },
};

let currentUser = null;

// ── Auth stubs (Member C replaces these) ───────────────────────────────────────

async function signInWithGoogle() {
  // TODO: Member C replaces with Firebase Auth
  return { uid: 'stub-uid-123', email: 'user@example.com' };
}

async function saveToFirestore(uid, stats) {
  // TODO: Member C replaces with Firestore write
  console.log('[EcoPrompt] Would save to Firestore:', uid, stats);
}

async function fetchFromFirestore(uid) {
  // TODO: Member C replaces with Firestore read
  return { totalCo2Grams: 42.5, totalTokensSaved: 18400, promptsCompressed: 37 };
}

// ── Message handler ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse);
  return true;
});

async function handleMessage(msg, sender) {
  switch (msg.type) {

    case 'PROMPT_INTERCEPTED': {
      const { prompt, site } = msg;

      // 1. Classify — real classifier now
      const classification = classify(prompt);
      console.log('[EcoPrompt] Classification:', classification);

      // 2. Route — real router now
      const routeResult = route(classification);
      console.log('[EcoPrompt] Route:', routeResult);

      // 3. Branch on route action
      if (routeResult.action === 'SKIP_AI') {
        // FACTUAL → web search
        const results = await searchGoogle(prompt);
        chrome.tabs.sendMessage(sender.tab.id, {
          type:    'SHOW_SKIP_AI_OVERLAY',
          query:   prompt,
          results: results,
        });
        return { ok: true };
      }

      // COMPRESS or MODEL_SWITCH → run compression
      const compressionResult = await compress(prompt);
      console.log('[EcoPrompt] Compression:', compressionResult);

      // 4. Carbon math using compressor's token counts
      const model  = inferModel(site);
      const stats  = calculateSavings(
        compressionResult.originalTokens,
        compressionResult.compressedTokens,
        model
      );

      // 5. Attach route suggestion for UI (model switch hint)
      stats.suggestedModel = routeResult.suggestedModel;
      stats.routeReason    = routeResult.reason;
      stats.method         = compressionResult.method; // webllm | rules | passthrough

      // 6. Send overlay to content script
      try {
        chrome.tabs.sendMessage(sender.tab.id, {
          type:       'SHOW_COMPRESSED_OVERLAY',
          original:   prompt,
          compressed: compressionResult.compressed,
          stats:      stats,
        });
      } catch (e) {
        console.error('[EcoPrompt] Could not reach content script:', e);
      }

      return { ok: true };
    }

    case 'USER_ACCEPTED_COMPRESSION': {
      accumulateSession(msg.stats);
      if (currentUser) await saveToFirestore(currentUser.uid, sessionStats);
      return { ok: true };
    }

    case 'USER_REJECTED_COMPRESSION':
      return { ok: true };

    case 'GET_LIFETIME_STATS': {
      let lifetime = null;
      if (currentUser) lifetime = await fetchFromFirestore(currentUser.uid);
      return { session: sessionStats, lifetime, user: currentUser };
    }

    case 'MODEL_STATUS': {
      // Ask offscreen doc directly
      const status = await getEngineStatus();
      return { ready: status === 'ready', status };
    }

    // These come FROM offscreen.js — forward to popup
    case 'WEBLLM_READY': {
      // Broadcast to popup if open
      chrome.runtime.sendMessage({ type: 'MODEL_STATUS_UPDATE', ready: true })
        .catch(() => {}); // popup may not be open
      return { ok: true };
    }

    case 'WEBLLM_PROGRESS': {
      chrome.runtime.sendMessage({
        type:    'MODEL_LOADING_PROGRESS',
        percent: msg.percent,
        text:    msg.text,
      }).catch(() => {});
      return { ok: true };
    }

    case 'WEBLLM_FAILED': {
      chrome.runtime.sendMessage({
        type:  'MODEL_STATUS_UPDATE',
        ready: false,
        error: msg.error,
      }).catch(() => {});
      return { ok: true };
    }

    case 'GOOGLE_SIGNIN': {
      currentUser = await signInWithGoogle();
      return { user: currentUser };
    }

    case 'GOOGLE_SIGNOUT': {
      currentUser = null;
      return { ok: true };
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function accumulateSession(stats) {
  sessionStats.co2Grams          += stats.co2Grams          ?? 0;
  sessionStats.waterMl           += stats.waterMl           ?? 0;
  sessionStats.whSaved           += stats.whSaved           ?? 0;
  sessionStats.tokensSaved       += stats.tokensSaved        ?? 0;
  sessionStats.promptsCompressed += 1;
  sessionStats.equiv.treeDays          += stats.equiv?.treeDays          ?? 0;
  sessionStats.equiv.carMiles          += stats.equiv?.carMiles          ?? 0;
  sessionStats.equiv.smartphoneCharges += stats.equiv?.smartphoneCharges ?? 0;

  if (sessionStats.tokensSaved > 0) {
    sessionStats.savingsPct = Math.round(
      (sessionStats.tokensSaved /
        (sessionStats.tokensSaved + (sessionStats.promptsCompressed * 50))) * 100
    );
  }
}

function inferModel(site) {
  const map = {
    'chatgpt.com':       'gpt-4',
    'chat.openai.com':   'gpt-4',
    'claude.ai':         'claude-sonnet',
    'gemini.google.com': 'gemini-pro',
    'grok.com':          'gpt-4',
  };
  return map[site] ?? 'claude-haiku';
}