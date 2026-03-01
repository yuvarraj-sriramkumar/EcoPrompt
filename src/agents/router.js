// src/agents/router.js
// Decides which PATH to take based on classifier output
// PATH A = compress and send  |  PATH B = suggest smaller model  |  PATH C = skip AI
// Member A calls: route(classificationResult) from worker.js


const MODEL_SUGGESTIONS = {
  SIMPLE:   { from: "gpt-4",        to: "claude-haiku",  saving: "10x less energy" },
  MODERATE: { from: "gpt-4",        to: "claude-sonnet", saving: "5x less energy"  },
  COMPLEX:  { from: "claude-haiku", to: "claude-opus",   saving: "best quality"    },
  FACTUAL:  { from: "any",          to: "web-search",    saving: "100% AI skipped" },
};


export function route(classification) {
  const { label } = classification;


  if (label === "FACTUAL") {
    return {
      path:           "C",       // Skip AI entirely
      action:         "SKIP_AI",
      suggestedModel: null,
      reason:         "Factual query — web search is faster and free",
    };
  }


  if (label === "SIMPLE" || label === "MODERATE") {
    return {
      path:           "A",       // Compress and send
      action:         "COMPRESS",
      suggestedModel: MODEL_SUGGESTIONS[label],
      reason:         `${label} task — compress prompt + suggest smaller model`,
    };
  }


  if (label === "COMPLEX") {
    return {
      path:           "B",       // Suggest model switch
      action:         "MODEL_SWITCH",
      suggestedModel: MODEL_SUGGESTIONS["COMPLEX"],
      reason:         "Complex task — needs large model but suggest switching from GPT-4",
    };
  }


  // Default fallback
  return {
    path:           "A",
    action:         "COMPRESS",
    suggestedModel: null,
    reason:         "Unknown classification — defaulting to compress",
  };
}