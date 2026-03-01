// src/agents/router.js
// Decides PATH based on classifier output
// PATH A = compress + small model | PATH B = compress + capable model | PATH C = skip AI
// Member A calls: route(classificationResult) from worker.js

const MODEL_RECOMMENDATIONS = {
  SIMPLE: {
    recommended:  "GPT-3.5-turbo",
    alternatives: ["Gemini 1.5 Flash", "Claude Haiku", "Llama 3 8B"],
    reason:       "Simple prompt — frontier model is overkill",
    costSaving:   "~10x cheaper than GPT-4o",
    co2Saving:    "~8x less CO₂ than GPT-4o",
    badge:        "💚 Low Energy",
    to:           "claude-haiku",
  },
  MODERATE: {
    recommended:  "GPT-4o-mini",
    alternatives: ["Gemini 1.5 Flash", "Claude Haiku", "Mistral 7B"],
    reason:       "Mid-complexity — efficient model handles this well",
    costSaving:   "~5x cheaper than GPT-4o",
    co2Saving:    "~4x less CO₂ than GPT-4o",
    badge:        "💛 Medium Energy",
    to:           "claude-sonnet",
  },
  COMPLEX: {
    recommended:  "Claude Sonnet",
    alternatives: ["GPT-4o", "Gemini 1.5 Pro", "Claude Opus"],
    reason:       "Complex reasoning required — use capable model",
    costSaving:   "Compression still saves ~30% token cost",
    co2Saving:    "Compressed tokens = less compute even on large model",
    badge:        "🔴 High Complexity",
    to:           "claude-opus",
  },
  FACTUAL: {
    recommended:  "Web Search",
    alternatives: ["Perplexity AI", "Google Search", "DuckDuckGo"],
    reason:       "Factual query — web search is faster, fresher, and free",
    costSaving:   "100% AI cost eliminated",
    co2Saving:    "100% AI energy saved",
    badge:        "🌱 Zero AI Energy",
    to:           "web-search",
  },
};

export function route(classification) {
  const { label } = classification;

  if (label === "FACTUAL") {
    return {
      path:            "C",
      action:          "SKIP_AI",
      shouldCompress:  false,
      modelSuggestion: MODEL_RECOMMENDATIONS.FACTUAL,
      reason:          "Factual query — web search is faster and free",
    };
  }

  if (label === "SIMPLE") {
    return {
      path:            "A",
      action:          "COMPRESS",
      shouldCompress:  true,
      modelSuggestion: MODEL_RECOMMENDATIONS.SIMPLE,
      reason:          "Simple task — rules compression + switch to lightweight model",
    };
  }

  if (label === "MODERATE") {
    return {
      path:            "A",
      action:          "COMPRESS",
      shouldCompress:  true,
      modelSuggestion: MODEL_RECOMMENDATIONS.MODERATE,
      reason:          "Moderate task — LLM compression + switch to efficient model",
    };
  }

  if (label === "COMPLEX") {
    return {
      path:            "B",
      action:          "MODEL_SWITCH",
      shouldCompress:  true,
      modelSuggestion: MODEL_RECOMMENDATIONS.COMPLEX,
      reason:          "Complex task — LLM compression + use capable model",
    };
  }

  // Default fallback
  return {
    path:            "A",
    action:          "COMPRESS",
    shouldCompress:  true,
    modelSuggestion: MODEL_RECOMMENDATIONS.MODERATE,
    reason:          "Unknown classification — defaulting to compress",
  };
}