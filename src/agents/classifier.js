// src/agents/classifier.js
// Labels every prompt as FACTUAL | SIMPLE | MODERATE | COMPLEX
// Member A calls: classify(prompt) from worker.js

const FACTUAL_PATTERNS = [
  // ── Start of string (clean prompts) ───────────────────────────────────────
  /^(what is|what are|what was|what were)\s/i,
  /^(who is|who was|who are|who were)\s/i,
  /^(when is|when was|when did|when does)\s/i,
  /^(where is|where are|where was)\s/i,
  /^(how many|how much|how tall|how old|how far|how long)\s/i,
  /^(define|definition of|meaning of)\s/i,

  // ── Anywhere in string (catches preprocessor artifacts) ───────────────────
  // Math expressions — "what is 2+2" anywhere in string
  /\bwhat is\s+[\d\s\+\-\*\/\^\(\)]+\??/i,
  // Arithmetic patterns — "2+2", "3*4", "10/2" anywhere
  /\b\d+\s*[\+\-\*\/]\s*\d+/i,
  // Factual lookup patterns anywhere
  /\b(capital of|population of|founded in|born in|located in)\b/i,
  /\b(current price|stock price|exchange rate|weather in)\b/i,
  /\bwhat does\s+\w+\s+mean\b/i,
  /\bwhen was\s+.+\s+(born|founded|invented|created|built)\b/i,
];

const KNOWLEDGE_PATTERNS = [
  /what is the difference between/i,
  /what are the differences between/i,
  /difference between .+ and .+/i,
  /compare .+ (and|vs|versus) .+/i,
  /how does .+ work/i,
  /how do .+ work/i,
  /explain (how|why|what|the)/i,
  /why (is|are|does|do|did|should)/i,
  /when (should|would|do) (i|you|we) use/i,
  /pros and cons/i,
  /advantages and disadvantages/i,
  /which is better/i,
  /what('s| is) the (best|right|correct) way/i,
];

const COMPLEX_PATTERNS = [
  /\b(architect|design system|system design|high.level|scalab)\b/i,
  /\b(refactor|rewrite|restructure|optimize|improve performance)\b/i,
  /\b(analyze|analyse|compare|evaluate|assess|audit|review)\b/i,
  /\b(pros and cons|trade.?off|versus|vs\.?|difference between)\b/i,
  /\b(step by step|step-by-step|comprehensiv|in.depth|thoroughly|detailed)\b/i,
  /\b(multiple|several|various|all of the|list of|each of)\b/i,
  /\b(debug|troubleshoot|diagnose|root cause|why (is|does|did|isn't|doesn't))\b/i,
  /\b(write a (complete|full|detailed|comprehensive)|generate a (complete|full))\b/i,
  /\b(algorithm|data structure|design pattern|microservice|distributed)\b/i,
  /\b(implement.+(from scratch|without|using only))\b/i,
];

const CODE_PATTERNS = [
  /\b(function|class|component|api|endpoint|query|script|module)\b/i,
  /\b(python|javascript|typescript|react|sql|java|golang|rust|swift)\b/i,
  /\b(bug|error|exception|fix|debug|issue|problem with my)\b/i,
  /\b(write|create|build|implement|develop|code)\b.{0,30}\b(in|using|with)\b/i,
];

const SIMPLE_PATTERNS = [
  /^(fix|correct|update|change|rename|add|remove|delete)\s/i,
  /^(translate|convert|format|summarize|list)\s/i,
  /^(what('s| is) the (syntax|command|shortcut|hotkey))/i,
];

// ── Complexity scorer ─────────────────────────────────────────────────────────

function complexityScore(text) {
  const t         = text.toLowerCase().trim();
  const words     = text.trim().split(/\s+/);
  const wordCount = words.length;
  let score       = 0;

  if (wordCount <= 8)  score += 10;
  if (wordCount <= 20) score += 10;
  if (wordCount > 20)  score += 20;
  if (wordCount > 40)  score += 15;
  if (wordCount > 60)  score += 10;

  const complexHits = COMPLEX_PATTERNS.filter(p => p.test(t)).length;
  score += complexHits * 20;

  const codeHits = CODE_PATTERNS.filter(p => p.test(t)).length;
  score += codeHits * 10;

  const simpleHits = SIMPLE_PATTERNS.filter(p => p.test(t)).length;
  score -= simpleHits * 15;

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  if (sentences > 2) score += 10;
  if (sentences > 4) score += 10;

  if (/^(what|who|when|where|which)\b/i.test(t)) score -= 5;

  return Math.max(0, Math.min(100, score));
}

// ── Confidence calculator ─────────────────────────────────────────────────────

function computeConfidence(label, score, text) {
  const t = text.toLowerCase();
  if (label === "FACTUAL") {
    const hits = FACTUAL_PATTERNS.filter(p => p.test(t)).length;
    return Math.min(0.99, 0.85 + hits * 0.05);
  }
  if (label === "COMPLEX") {
    const hits = COMPLEX_PATTERNS.filter(p => p.test(t)).length;
    return Math.min(0.99, 0.70 + hits * 0.08);
  }
  if (label === "SIMPLE") return score < 20 ? 0.90 : 0.70;
  return 0.65;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function classify(prompt) {
  const t         = prompt.toLowerCase().trim();
  const words     = prompt.trim().split(/\s+/);
  const wordCount = words.length;

  // ── Step 1: FACTUAL check FIRST — highest priority ────────────────────────
  // Check before knowledge patterns because math like "what is 2+2"
  // must always be FACTUAL regardless of surrounding text
  if (FACTUAL_PATTERNS.some(p => p.test(t))) {
    return {
      label:      "FACTUAL",
      confidence: computeConfidence("FACTUAL", 0, t),
      wordCount,
      score:      0,
      path:       "C",
    };
  }

  // ── Step 2: KNOWLEDGE patterns — needs LLM explanation, not factual lookup ─
  if (KNOWLEDGE_PATTERNS.some(p => p.test(t))) {
    const score = complexityScore(prompt);
    const label = score >= 55 ? "COMPLEX" : "MODERATE";
    return {
      label,
      confidence: 0.85,
      wordCount,
      score,
      path: label === "COMPLEX" ? "B" : "A",
    };
  }

  // ── Step 3: Score-based for everything else ───────────────────────────────
  const score = complexityScore(prompt);
  let label;
  if (score < 25)      label = "SIMPLE";
  else if (score < 55) label = "MODERATE";
  else                 label = "COMPLEX";

  return {
    label,
    confidence: computeConfidence(label, score, t),
    wordCount,
    score,
    path: label === "COMPLEX" ? "B" : "A",
  };
}