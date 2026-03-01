// src/utils/tokenizer.js
// Token estimation per model
// Member A calls: estimateTokens(text, model)

const TOKENS_PER_WORD = {
  "gpt-4":         1.33,
  "gpt-4o":        1.33,
  "gpt-3.5":       1.33,
  "claude-opus":   1.25,
  "claude-sonnet": 1.25,
  "claude-haiku":  1.25,
  "gemini-pro":    1.30,
  "gemini-flash":  1.30,
  "default":       1.33,
};

export function estimateTokens(text, modelKey = "default") {
  if (!text || !text.trim()) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const rate  = TOKENS_PER_WORD[modelKey] ?? TOKENS_PER_WORD["default"];
  return Math.ceil(words * rate);
}

export function tokenDiff(originalText, compressedText, modelKey = "default") {
  const original   = estimateTokens(originalText,   modelKey);
  const compressed = estimateTokens(compressedText, modelKey);
  return {
    original,
    compressed,
    saved:   Math.max(0, original - compressed),
    savingsPct: original > 0
      ? Math.round(((original - compressed) / original) * 100)
      : 0,
  };
}