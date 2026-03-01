// src/agents/classifier.js
// Labels every prompt as FACTUAL | SIMPLE | MODERATE | COMPLEX
// Member A calls: classify(prompt) from worker.js

// ── Signal weights ────────────────────────────────────────────────────────────
// Each pattern group adds/subtracts from a complexity score
// Final score maps to label — more accurate than pure keyword matching

const FACTUAL_PATTERNS = [
  /^(what is|what are|what was|what were)\s/,
  /^(who is|who was|who are|who were)\s/,
  /^(when is|when was|when did|when does)\s/,
  /^(where is|where are|where was)\s/,
  /^(how many|how much|how tall|how old|how far|how long)\s/,
  /\b(capital of|population of|founded in|born in|located in)\b/,
  /\b(convert \d|how many \w+ in \w+)\b/,
  /\b(current price|stock price|exchange rate|weather in)\b/,
  /^(define|definition of|meaning of|what does \w+ mean)\b/,
  /^(when was .+ (born|founded|invented|created|built))/,
];

const COMPLEX_PATTERNS = [
  // Architecture and design
  /\b(architect|design system|system design|high.level|scalab)\b/,
  // Refactoring and optimization
  /\b(refactor|rewrite|restructure|optimize|improve performance)\b/,
  // Analysis and comparison
  /\b(analyze|analyse|compare|evaluate|assess|audit|review)\b/,
  /\b(pros and cons|trade.?off|versus|vs\.?|difference between)\b/,
  // Multi-step indicators
  /\b(step by step|step-by-step|comprehensiv|in.depth|thoroughly|detailed)\b/,
  /\b(multiple|several|various|all of the|list of|each of)\b/,
  // Debugging and testing
  /\b(debug|troubleshoot|diagnose|root cause|why (is|does|did|isn't|doesn't))\b/,
  // Writing and generation
  /\b(write a (complete|full|detailed|comprehensive)|generate a (complete|full))\b/,
  // Code complexity
  /\b(algorithm|data structure|design pattern|microservice|distributed)\b/,
  /\b(implement.+(from scratch|without|using only))\b/,
];

const CODE_PATTERNS = [
  /\b(function|class|component|api|endpoint|query|script|module)\b/,
  /\b(python|javascript|typescript|react|sql|java|golang|rust|swift)\b/,
  /\b(bug|error|exception|fix|debug|issue|problem with my)\b/,
  /\b(write|create|build|implement|develop|code)\b.{0,30}\b(in|using|with)\b/,
];

const SIMPLE_PATTERNS = [
  /^(fix|correct|update|change|rename|add|remove|delete)\s/i,
  /^(translate|convert|format|summarize|list)\s/i,
  /^(what('s| is) the (syntax|command|shortcut|hotkey))/i,
];

// ── Complexity scorer ─────────────────────────────────────────────────────────
// Returns a 0-100 score — higher = more complex

function complexityScore(text) {
  const t         = text.toLowerCase().trim();
  const words     = text.trim().split(/\s+/);
  const wordCount = words.length;
  let score       = 0;

  // Base score from word count
  // Short ≠ simple (e.g. "Refactor codebase") but length is still a signal
  if (wordCount <= 8)  score += 10;
  if (wordCount <= 20) score += 10;
  if (wordCount > 20)  score += 20;
  if (wordCount > 40)  score += 15;
  if (wordCount > 60)  score += 10;

  // Complex indicators — strong signal
  const complexHits = COMPLEX_PATTERNS.filter(p => p.test(t)).length;
  score += complexHits * 20;

  // Code present — moderate complexity boost
  const codeHits = CODE_PATTERNS.filter(p => p.test(t)).length;
  score += codeHits * 10;

  // Simple indicators — reduce score
  const simpleHits = SIMPLE_PATTERNS.filter(p => p.test(t)).length;
  score -= simpleHits * 15;

  // Multi-sentence — complexity signal
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  if (sentences > 2) score += 10;
  if (sentences > 4) score += 10;

  // Question words at start — slightly simpler
  if (/^(what|who|when|where|which)\b/i.test(t)) score -= 5;

  return Math.max(0, Math.min(100, score));
}

// ── Confidence calculator ─────────────────────────────────────────────────────

function computeConfidence(label, score, text) {
  const t = text.toLowerCase();

  if (label === "FACTUAL") {
    // High confidence if multiple factual patterns match
    const hits = FACTUAL_PATTERNS.filter(p => p.test(t)).length;
    return Math.min(0.99, 0.85 + hits * 0.05);
  }

  if (label === "COMPLEX") {
    const hits = COMPLEX_PATTERNS.filter(p => p.test(t)).length;
    return Math.min(0.99, 0.70 + hits * 0.08);
  }

  if (label === "SIMPLE") {
    // High confidence only if score is very low
    return score < 20 ? 0.90 : 0.70;
  }

  // MODERATE — middle ground, inherently less certain
  return 0.65;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function classify(prompt) {
  const t         = prompt.toLowerCase().trim();
  const words     = prompt.trim().split(/\s+/);
  const wordCount = words.length;

  // FACTUAL check first — highest priority, most certain
  if (FACTUAL_PATTERNS.some(p => p.test(t))) {
    return {
      label:      "FACTUAL",
      confidence: computeConfidence("FACTUAL", 0, t),
      wordCount,
      score:      0,
      path:       "C",
    };
  }

  // Score-based classification for everything else
  const score = complexityScore(prompt);

  let label;
  if (score < 25)      label = "SIMPLE";
  else if (score < 55) label = "MODERATE";
  else                 label = "COMPLEX";

  return {
    label,
    confidence: computeConfidence(label, score, t),
    wordCount,
    score,      // expose raw score — useful for UI debug display
    path:       label === "COMPLEX" ? "B" : "A",
  };
}