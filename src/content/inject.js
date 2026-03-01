// src/content/inject.js

const SITE_CONFIGS = {
  'chatgpt.com': {
    textareaSelector: '#prompt-textarea',
    submitSelector:   'button[data-testid="send-button"]',
  },
  'chat.openai.com': {
    textareaSelector: '#prompt-textarea',
    submitSelector:   'button[data-testid="send-button"]',
  },
  'claude.ai': {
    textareaSelector: 'div[contenteditable="true"]',
    submitSelector:   'button[aria-label="Send message"]',
  },
  'gemini.google.com': {
    textareaSelector: 'div[contenteditable="true"]',
    submitSelector:   'button.send-button',
  },
  'grok.com': {
    textareaSelector: 'textarea',
    submitSelector:   'button[type="submit"]',
  },
};

const hostname = window.location.hostname.replace('www.', '');
const config   = SITE_CONFIGS[hostname];

if (config) init();

// ── State ──────────────────────────────────────────────────────────────────────

let listenerAttached  = false;
let isProcessing      = false;  // true while overlay is showing
let promptChanged     = true;   // false after overlay shown, resets on text change
let lastPromptValue   = '';

// ── Init ───────────────────────────────────────────────────────────────────────

function init() {
  const observer = new MutationObserver(() => attachListeners());
  observer.observe(document.body, { childList: true, subtree: true });
  attachListeners();
}

// ── Attach listeners ───────────────────────────────────────────────────────────

function attachListeners() {
  const submitBtn = document.querySelector(config.submitSelector);
  const textarea  = document.querySelector(config.textareaSelector);

  if (!submitBtn || !textarea || listenerAttached) return;
  listenerAttached = true;

  // Watch for text changes — rearm the interceptor when user edits
  textarea.addEventListener('input', () => {
    const currentVal = textarea.innerText || textarea.value;
    if (currentVal !== lastPromptValue) {
      promptChanged    = true;
      lastPromptValue  = currentVal;
    }
  });

  // Click listener
  submitBtn.addEventListener('click', handleSubmit, true);

  // Enter key listener
  textarea.addEventListener('keydown', (e) => {
    // Enter without Shift = submit on all these sites
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e);
    }
  }, true);

  // Reset listener if button removed from DOM (React re-render)
  const btnObserver = new MutationObserver(() => {
    if (!document.contains(submitBtn)) {
      listenerAttached = false;
      btnObserver.disconnect();
    }
  });
  btnObserver.observe(document.body, { childList: true, subtree: true });
}

// ── Core intercept logic ───────────────────────────────────────────────────────

async function handleSubmit(e) {
  // If we're already processing OR prompt hasn't changed since last overlay
  // → let the event through naturally
  if (isProcessing || !promptChanged) return;

  const textarea = document.querySelector(config.textareaSelector);
  if (!textarea) return;

  const prompt = (textarea.innerText || textarea.value).trim();
  if (!prompt) return;

  // Stop submission
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  // Lock until user makes a choice
  isProcessing  = true;
  promptChanged = false;
  lastPromptValue = prompt;

  // Send to service worker
  chrome.runtime.sendMessage({
    type:   'PROMPT_INTERCEPTED',
    prompt: prompt,
    site:   hostname,
  });
}

// ── Message listener from service worker ──────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SHOW_COMPRESSED_OVERLAY') {
    showCompressionOverlay(msg.original, msg.compressed, msg.stats);
  }
  if (msg.type === 'SHOW_SKIP_AI_OVERLAY') {
    showSkipAIOverlay(msg.query, msg.results);
  }
});

// ── Compression Overlay ────────────────────────────────────────────────────────

function showCompressionOverlay(original, compressed, stats) {
  removeOverlay();

  const overlay = document.createElement('div');
  overlay.id    = 'ecoprompt-overlay';
  overlay.innerHTML = `
    <div id="ep-container">
      <div id="ep-header">
        <span>🌿 EcoPrompt</span>
        <button id="ep-close">✕</button>
      </div>

      <div id="ep-comparison">
        <div class="ep-col">
          <label>Original</label>
          <div class="ep-text">${escapeHtml(original)}</div>
          <span class="ep-token-count">${stats.originalTokens} tokens</span>
        </div>
        <div class="ep-col">
          <label>Compressed ✨</label>
          <div class="ep-text ep-compressed">${escapeHtml(compressed)}</div>
          <span class="ep-token-count">${stats.compressedTokens} tokens</span>
        </div>
      </div>

      <div id="ep-savings">
        <div class="ep-metric">
          <span class="ep-metric-val">${stats.savingsPct}%</span>
          <span class="ep-metric-label">Tokens Saved</span>
        </div>
        <div class="ep-metric">
          <span class="ep-metric-val">${stats.co2Grams.toFixed(3)}g</span>
          <span class="ep-metric-label">CO₂ Saved</span>
        </div>
        <div class="ep-metric">
          <span class="ep-metric-val">${stats.waterMl.toFixed(2)}ml</span>
          <span class="ep-metric-label">Water Saved</span>
        </div>
        <div class="ep-metric">
          <span class="ep-metric-val">${stats.whSaved.toFixed(5)} Wh</span>
          <span class="ep-metric-label">Energy Saved</span>
        </div>
      </div>

      <div id="ep-actions">
        <button id="ep-reject">Use Original</button>
        <button id="ep-accept">Use Compressed ✓</button>
      </div>
    </div>
  `;

  injectStyles(overlay);
  document.body.appendChild(overlay);

  document.getElementById('ep-close').onclick  = () => {
    removeOverlay();
    isProcessing = true;   // keep locked — user dismissed without choosing
    promptChanged = false; // require re-edit to trigger again
  };

  document.getElementById('ep-reject').onclick = () => {
    removeOverlay();
    chrome.runtime.sendMessage({ type: 'USER_REJECTED_COMPRESSION' });
    isProcessing = false;
    submitNatively();
  };

  document.getElementById('ep-accept').onclick = () => {
    removeOverlay();
    chrome.runtime.sendMessage({ type: 'USER_ACCEPTED_COMPRESSION', stats });
    isProcessing = false;
    injectAndSubmit(compressed);
  };
}

// ── Skip AI Overlay ────────────────────────────────────────────────────────────

function showSkipAIOverlay(query, results) {
  removeOverlay();

  const resultsHTML = results.map((r, i) => `
    <a class="ep-result" href="${r.url}" target="_blank" rel="noopener">
      <div class="ep-result-num">${i + 1}</div>
      <div class="ep-result-body">
        <div class="ep-result-title">${escapeHtml(r.title)}</div>
        <div class="ep-result-snippet">${escapeHtml(r.snippet)}</div>
        <div class="ep-result-url">${escapeHtml(r.url)}</div>
      </div>
    </a>
  `).join('');

  const overlay = document.createElement('div');
  overlay.id    = 'ecoprompt-overlay';
  overlay.innerHTML = `
    <div id="ep-container">
      <div id="ep-header">
        <span>🌿 EcoPrompt — Skip AI</span>
        <button id="ep-close">✕</button>
      </div>

      <div id="ep-skip-label">
        This looks like a factual query. Here are direct answers — no AI needed:
      </div>

      <div id="ep-query-shown">🔍 "${escapeHtml(query)}"</div>

      <div id="ep-results">
        ${results.length > 0 ? resultsHTML : '<p class="ep-no-results">No results found.</p>'}
      </div>

      <div id="ep-skip-savings">
        <span>🌍 Skipping AI entirely saves ~0.05g CO₂ per query</span>
      </div>

      <div id="ep-actions">
        <button id="ep-reject">Ask AI Anyway</button>
      </div>
    </div>
  `;

  injectStyles(overlay);
  document.body.appendChild(overlay);

  document.getElementById('ep-close').onclick  = () => {
    removeOverlay();
    isProcessing  = false;
    promptChanged = false;
  };

  document.getElementById('ep-reject').onclick = () => {
    // User wants to ask AI anyway — let it through
    removeOverlay();
    isProcessing = false;
    submitNatively();
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function removeOverlay() {
  document.getElementById('ecoprompt-overlay')?.remove();
}

function submitNatively() {
  // Submit without triggering our interceptor again
  isProcessing  = true;
  promptChanged = false;
  setTimeout(() => {
    document.querySelector(config.submitSelector)?.click();
    // Unlock after a beat — ready for next fresh message
    setTimeout(() => { isProcessing = false; }, 500);
  }, 100);
}

function injectAndSubmit(text) {
  const textarea = document.querySelector(config.textareaSelector);
  if (!textarea) return;

  if (textarea.tagName === 'TEXTAREA') {
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    textarea.innerText = text;
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }

  // Don't re-intercept this submission
  isProcessing  = true;
  promptChanged = false;

  setTimeout(() => {
    document.querySelector(config.submitSelector)?.click();
    setTimeout(() => { isProcessing = false; }, 500);
  }, 150);
}

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function injectStyles(overlay) {
  const style       = document.createElement('style');
  style.textContent = overlayCSS();
  overlay.appendChild(style);
}

function overlayCSS() {
  return `
    #ecoprompt-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.65);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #ep-container {
      background: #1a1a2e;
      border: 1px solid #2d6a4f;
      border-radius: 12px;
      padding: 24px;
      width: 740px;
      max-width: 92vw;
      max-height: 88vh;
      overflow-y: auto;
      color: #e0e0e0;
    }
    #ep-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      font-size: 15px;
      font-weight: 700;
      color: #52b788;
    }
    #ep-close {
      background: none; border: none;
      color: #aaa; cursor: pointer; font-size: 16px;
    }
    #ep-comparison {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }
    .ep-col label {
      display: block; font-size: 11px;
      text-transform: uppercase; color: #888; margin-bottom: 6px;
    }
    .ep-text {
      background: #0d1117; border-radius: 8px;
      padding: 12px; font-size: 13px; line-height: 1.5;
      min-height: 80px; max-height: 150px;
      overflow-y: auto; white-space: pre-wrap;
    }
    .ep-compressed { border: 1px solid #2d6a4f; }
    .ep-token-count { font-size: 11px; color: #555; margin-top: 4px; display: block; }
    #ep-savings {
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 10px; background: #0d1117;
      border-radius: 8px; padding: 14px;
      margin-bottom: 16px; text-align: center;
    }
    .ep-metric-val   { display: block; font-size: 18px; font-weight: 700; color: #52b788; }
    .ep-metric-label { font-size: 10px; color: #666; }

    /* Skip AI styles */
    #ep-skip-label {
      font-size: 13px; color: #aaa;
      margin-bottom: 10px; line-height: 1.5;
    }
    #ep-query-shown {
      background: #0d1117; border-radius: 8px;
      padding: 10px 14px; font-size: 13px;
      color: #52b788; margin-bottom: 14px;
      font-style: italic;
    }
    #ep-results { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
    .ep-result {
      display: flex; gap: 12px;
      background: #0d1117; border-radius: 8px;
      padding: 12px; text-decoration: none;
      border: 1px solid #1e2d25;
      transition: border-color 0.15s;
    }
    .ep-result:hover { border-color: #52b788; }
    .ep-result-num {
      color: #52b788; font-weight: 700;
      font-size: 16px; min-width: 20px;
      padding-top: 2px;
    }
    .ep-result-title {
      color: #e0e0e0; font-size: 13px;
      font-weight: 600; margin-bottom: 4px;
    }
    .ep-result-snippet { color: #888; font-size: 12px; line-height: 1.4; margin-bottom: 4px; }
    .ep-result-url     { color: #2d6a4f; font-size: 11px; }
    #ep-skip-savings {
      background: #1a2e1e; border-radius: 8px;
      padding: 10px 14px; font-size: 12px;
      color: #52b788; margin-bottom: 14px;
    }
    .ep-no-results { color: #666; font-size: 13px; padding: 16px 0; text-align: center; }

    /* Actions */
    #ep-actions { display: flex; gap: 12px; justify-content: flex-end; }
    #ep-reject {
      background: transparent; border: 1px solid #444;
      color: #aaa; padding: 10px 20px;
      border-radius: 8px; cursor: pointer; font-size: 14px;
    }
    #ep-accept {
      background: #2d6a4f; border: none;
      color: white; padding: 10px 24px;
      border-radius: 8px; cursor: pointer;
      font-size: 14px; font-weight: 600;
    }
    #ep-accept:hover { background: #52b788; color: #0d1117; }
    #ep-reject:hover { background: #1a1a1a; }
  `;
}