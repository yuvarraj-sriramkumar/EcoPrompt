// src/popup/popup.js

document.addEventListener('DOMContentLoaded', async () => {
  await refreshStats();
  await checkModelStatus();
  await checkAuthState();
  setupTabs();
  setupSettings();
  setupAuth();
});

// ── Stats ──────────────────────────────────────────────────────────────────────

async function refreshStats() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_LIFETIME_STATS' });
  if (!res) return;

  const s = res.session;

  // Hero
  document.getElementById('co2-saved').textContent    = s.co2Grams.toFixed(3);

  // Equivalencies
  document.getElementById('tree-days').textContent    = s.equiv.treeDays.toFixed(4);
  document.getElementById('car-miles').textContent    = s.equiv.carMiles.toFixed(5);
  document.getElementById('phone-charges').textContent= s.equiv.smartphoneCharges.toFixed(3);

  // Session panel
  document.getElementById('tokens-saved').textContent = s.tokensSaved.toLocaleString();
  document.getElementById('prompts-count').textContent= s.promptsCompressed;
  document.getElementById('avg-compression').textContent = `${s.savingsPct}%`;
  document.getElementById('water-saved').textContent  = `${s.waterMl.toFixed(3)} ml`;
  document.getElementById('energy-saved').textContent = `${s.whSaved.toFixed(5)} Wh`;

  // Lifetime panel
  if (res.lifetime) {
    document.getElementById('lt-co2').textContent    = `${res.lifetime.totalCo2Grams.toFixed(2)}g`;
    document.getElementById('lt-tokens').textContent = res.lifetime.totalTokensSaved.toLocaleString();
    document.getElementById('lt-prompts').textContent= res.lifetime.promptsCompressed;
  } else {
    document.getElementById('lifetime-signin-prompt').classList.remove('hidden');
  }
}

// ── Model status ───────────────────────────────────────────────────────────────

async function checkModelStatus() {
  const res = await chrome.runtime.sendMessage({ type: 'MODEL_STATUS' });
  const el  = document.getElementById('model-status');
  if (res?.ready) {
    el.textContent  = '● Model Ready';
    el.className    = 'status-ready';
  } else {
    el.textContent  = '◌ Loading model...';
    el.className    = 'status-loading';
  }
}

// ── Auth ───────────────────────────────────────────────────────────────────────

async function checkAuthState() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_LIFETIME_STATS' });
  if (res?.user) {
    showSignedIn(res.user);
  } else {
    showSignedOut();
  }
}

function showSignedIn(user) {
  document.getElementById('auth-banner').classList.add('hidden');
  document.getElementById('user-bar').classList.remove('hidden');
  document.getElementById('user-email').textContent = user.email;
}

function showSignedOut() {
  document.getElementById('auth-banner').classList.remove('hidden');
  document.getElementById('user-bar').classList.add('hidden');
}

function setupAuth() {
  document.getElementById('signin-btn').addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ type: 'GOOGLE_SIGNIN' });
    if (res?.user) {
      showSignedIn(res.user);
      await refreshStats();
    }
  });

  document.getElementById('signout-btn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'GOOGLE_SIGNOUT' });
    showSignedOut();
  });
}

// ── Tabs ───────────────────────────────────────────────────────────────────────

function setupTabs() {
  const panels = {
    session:  document.getElementById('panel-session'),
    lifetime: document.getElementById('panel-lifetime'),
    settings: document.getElementById('panel-settings'),
  };

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      Object.values(panels).forEach(p => p.classList.add('hidden'));
      panels[tab.dataset.tab].classList.remove('hidden');
    });
  });
}

// ── Settings ───────────────────────────────────────────────────────────────────

function setupSettings() {
  const modeSelect = document.getElementById('compression-mode');
  const autoAccept = document.getElementById('auto-accept');

  // Load saved settings
  chrome.storage.sync.get(['compressionMode', 'autoAccept'], (data) => {
    if (data.compressionMode) modeSelect.value = data.compressionMode;
    if (data.autoAccept)      autoAccept.checked = data.autoAccept;
  });

  modeSelect.addEventListener('change', () => {
    chrome.storage.sync.set({ compressionMode: modeSelect.value });
  });

  autoAccept.addEventListener('change', () => {
    chrome.storage.sync.set({ autoAccept: autoAccept.checked });
  });
}
```

---

## Step 7 — Load Into Chrome and Test
```
1. chrome://extensions
2. Developer Mode ON
3. Load Unpacked → select your ecoprompt/ folder
4. Go to chatgpt.com
5. Type a prompt, click submit
6. You should see the overlay appear
7. Click the extension icon → popup opens with stats