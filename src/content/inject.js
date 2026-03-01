// src/content/inject.js
// Injected into ChatGPT, Claude, Gemini etc.
// Responsibility: detect submit, grab prompt, trigger compression flow

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

if (!config) {
  console.warn('[EcoPrompt] No config for', hostname);
} else {
  init();
}

function init() {
  // Use MutationObserver because these are React apps
  // DOM elements get destroyed and recreated on navigation
  const observer = new MutationObserver(() => attachListeners());
  observer.observe(document.body, { childList: true, subtree: true });
  attachListeners(); // also try immediately
}

let listenerAttached = false;

function attachListeners() {
  const submitBtn = document.querySelector(config.submitSelector);
  if (!submitBtn || listenerAttached) return;

  listenerAttached = true;

  submitBtn.addEventListener('click', async (e) => {
    const textarea = document.querySelector(config.textareaSelector);
    if (!textarea) return;

    const prompt = textarea.innerText || textarea.value;
    if (!prompt?.trim()) return;

    // Stop the original submission
    e.preventDefault();
    e.stopPropagation();

    // Send prompt to service worker to start the pipeline
    chrome.runtime.sendMessage({
      type:     'PROMPT_INTERCEPTED',
      prompt:   prompt.trim(),
      site:     hostname,
    });
  }, true); // capture phase so we get it before the site's own handler

  // Reset flag when button is removed from DOM (React re-render)
  const btnObserver = new MutationObserver(() => {
    if (!document.contains(submitBtn)) {
      listenerAttached = false;
      btnObserver.disconnect();
    }
  });
  btnObserver.observe(document.body, { childList: true, subtree: true });
}

// Listen for messages back from service worker
chrome.runtime.onMessage.addListener((msg) => {

  if (msg.type === 'SHOW_COMPRESSED_OVERLAY') {
    showOverlay(msg.original, msg.compressed, msg.stats);
  }

});

// ── Overlay UI ────────────────────────────────────────────────────────────────
// This appears inline on the chatbot page

function showOverlay(original, compressed, stats) {
  // Remove existing overlay if any
  document.getElementById('ecoprompt-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'ecoprompt-overlay';
  overlay.innerHTML = `
    <div id="ep-container">
      <div id="ep-header">
        <span>🌿 EcoPrompt</span>
        <button id="ep-close">✕</button>
      </div>

      <div id="ep-comparison">
        <div class="ep-col">
          <label>Original</label>
          <div class="ep-text" id="ep-original">${escapeHtml(original)}</div>
          <span class="ep-token-count">${stats.originalTokens} tokens</span>
        </div>
        <div class="ep-col">
          <label>Compressed ✨</label>
          <div class="ep-text" id="ep-compressed">${escapeHtml(compressed)}</div>
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

  // Inject styles
  const style = document.createElement('style');
  style.textContent = overlayCSS();
  overlay.appendChild(style);

  document.body.appendChild(overlay);

  // Wire buttons
  document.getElementById('ep-close').onclick   = () => overlay.remove();
  document.getElementById('ep-reject').onclick  = () => {
    overlay.remove();
    // re-trigger original submission
    chrome.runtime.sendMessage({ type: 'USER_REJECTED_COMPRESSION' });
    submitOriginalPrompt(original);
  };
  document.getElementById('ep-accept').onclick  = () => {
    overlay.remove();
    injectPromptAndSubmit(compressed);
    chrome.runtime.sendMessage({ type: 'USER_ACCEPTED_COMPRESSION', stats });
  };
}

function injectPromptAndSubmit(text) {
  const textarea = document.querySelector(config.textareaSelector);
  if (!textarea) return;

  // Handle both contenteditable divs and textareas
  if (textarea.tagName === 'TEXTAREA') {
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    textarea.innerText = text;
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }

  // Wait for React to process the input then click submit
  setTimeout(() => {
    document.querySelector(config.submitSelector)?.click();
  }, 100);
}

function submitOriginalPrompt(text) {
  // User chose original — just resubmit as-is
  setTimeout(() => {
    document.querySelector(config.submitSelector)?.click();
  }, 100);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function overlayCSS() {
  return `
    #ecoprompt-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
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
      width: 720px;
      max-width: 90vw;
      color: #e0e0e0;
    }
    #ep-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      font-size: 16px;
      font-weight: 600;
      color: #52b788;
    }
    #ep-close {
      background: none;
      border: none;
      color: #aaa;
      cursor: pointer;
      font-size: 16px;
    }
    #ep-comparison {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }
    .ep-col label {
      display: block;
      font-size: 11px;
      text-transform: uppercase;
      color: #888;
      margin-bottom: 6px;
    }
    .ep-text {
      background: #0d1117;
      border-radius: 8px;
      padding: 12px;
      font-size: 13px;
      line-height: 1.5;
      min-height: 80px;
      max-height: 160px;
      overflow-y: auto;
      white-space: pre-wrap;
    }
    #ep-compressed {
      border: 1px solid #2d6a4f;
    }
    .ep-token-count {
      font-size: 11px;
      color: #666;
      margin-top: 4px;
      display: block;
    }
    #ep-savings {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      background: #0d1117;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
      text-align: center;
    }
    .ep-metric-val {
      display: block;
      font-size: 20px;
      font-weight: 700;
      color: #52b788;
    }
    .ep-metric-label {
      font-size: 11px;
      color: #888;
    }
    #ep-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }
    #ep-reject {
      background: transparent;
      border: 1px solid #444;
      color: #aaa;
      padding: 10px 20px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
    }
    #ep-accept {
      background: #2d6a4f;
      border: none;
      color: white;
      padding: 10px 24px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
    }
    #ep-accept:hover { background: #52b788; }
    #ep-reject:hover { background: #1a1a1a; }
  `;
}