// src/utils/tokenizer.js

// BPE token estimator — different models have different tokenizers
// Good enough for carbon math and compression validation

const MODEL_RATIOS = {
  'gpt-4':         4.0,   // chars per token
  'claude-sonnet': 3.8,
  'gemini-pro':    4.1,
  'claude-haiku':  3.8,
  'default':       4.0,
};

export function estimateTokens(text, model = 'default') {
  if (!text) return 0;
  const charsPerToken = MODEL_RATIOS[model] ?? MODEL_RATIOS['default'];
  return Math.ceil(text.length / charsPerToken);
}