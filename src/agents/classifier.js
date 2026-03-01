// src/agents/classifier.js
// Labels every prompt as FACTUAL | SIMPLE | MODERATE | COMPLEX | FILLER

// ── FILLER PATTERNS — checked first, before everything ───────────────────────
const FILLER_PATTERNS = [
  // Greetings with optional trailing words ("hey how are you today")
  /^(hey+|hi+|hello+|hiya|howdy|yo+|sup|heya)[,!.]?\s*(love|baby|babe|buddy|mate|dude|bro|dear|friend|there)?[,!.]?\s*(how\s*(are\s*(you|u)|r\s*u|you\s*doing|u\s*doin|is\s*it\s*going|have\s*you\s*been))[\s\w,.!?]*$/i,
  /^(hey+|hi+|hello+|hiya|howdy|yo+|sup|heya)[,!.]?\s*(love|baby|babe|buddy|mate|dude|bro|dear|friend|there)?[,!.]?\s*$/i,
  /^(good\s*(morning|afternoon|evening|night|day))[\s\w,.!?]*$/i,
  /^how\s*(are\s*(you|u)|r\s*u|you\s*doing|u\s*doin|is\s*it\s*going|have\s*you\s*been)[\s\w,.!?]*$/i,
  /^(what'?s\s*up|wassup|wazzup|sup)[\s\w,.!?]*$/i,
  /^(hope\s*(you|u|your)\s*(are|r)\s*(doing|well|good|okay|alright|fine|great))[\s\w,.!?]*$/i,
  /^(just\s*(wanted|checking|saying)[\s\w]*\s*(hi|hello|hey))[\s\w,.!?]*$/i,
  /^(thinking\s*(of|about)\s*(you|ya|u))[\s\w,.!?]*$/i,
  /^(miss\s*(you|ya|u))[\s\w,.!?]*$/i,

  // Farewells
  /^(bye+|goodbye|good\s*bye|bbye|byee+|bai|cya|ttyl|tata)[\s\w,.!?]*$/i,
  /^(see\s*(ya|you|u))[\s\w,.!?]*$/i,
  /^(take\s*care)[\s\w,.!?]*$/i,
  /^(have\s*a\s*(good|great|nice|wonderful|lovely|blessed)\s*(day|night|one|evening|weekend|time))[\s\w,.!?]*$/i,
  /^(good\s*(night|luck|job|work|one))[\s\w,.!?]*$/i,
  /^(talk\s*(to\s*you\s*)?(later|soon)|catch\s*you\s*later|catch\s*ya)[\s\w,.!?]*$/i,
  /^(peace\s*(out)?|later\s*(dude|bro|mate)?)[\s\w,.!?]*$/i,

  // Thank yous
  /^(thanks?|thank\s*you|thx|thnx|ty|tq)\s*(so\s*much|a\s*lot|very\s*much|a\s*ton|heaps|loads|for\s*everything|for\s*(your\s*)?help)?[\s\w,.!?]*$/i,
  /^(appreciate\s*(it|that|you|your\s*help|everything)?)[\s\w,.!?]*$/i,
  /^(much\s*appreciated|greatly\s*appreciated)[\s\w,.!?]*$/i,
  /^(you'?re?\s*(a\s*)?(lifesaver|legend|star|hero|goat|the\s*best|amazing|awesome|great|wonderful))[\s\w,.!?]*$/i,

  // Acknowledgements
  /^(ok+|okay|k|kk|okie|alright|aight|ight)[\s\w,.!?]*$/i,
  /^(got\s*it|gotcha|gotchu|get\s*it|i\s*see|i\s*get\s*it|i\s*understand|understood)[\s\w,.!?]*$/i,
  /^(noted|copy\s*(that)?|roger\s*(that)?)[\s\w,.!?]*$/i,
  /^(sounds?\s*(good|great|perfect|awesome|right))[\s\w,.!?]*$/i,
  /^(makes?\s*(sense|total\s*sense|perfect\s*sense))[\s\w,.!?]*$/i,
  /^(cool+|nice+|sweet+|dope|lit|fire|sick)[\s\w,.!?]*$/i,
  /^(perfect+|great+|awesome+|wonderful+|excellent+|brilliant+|fantastic+)[\s\w,.!?]*$/i,

  // Praise
  /^(good\s*(job|work|one|answer|response|explanation))[\s\w,.!?]*$/i,
  /^(well\s*done|well\s*said|well\s*explained)[\s\w,.!?]*$/i,
  /^(that\s*(was\s*)?(great|perfect|awesome|helpful|amazing|exactly\s*what\s*i\s*needed))[\s\w,.!?]*$/i,
  /^(this\s*(is\s*)?(great|perfect|awesome|helpful|amazing))[\s\w,.!?]*$/i,
  /^(i\s*love\s*(this|it|that))[\s\w,.!?]*$/i,

  // Affection
  /^(i\s*love\s*you|love\s*you|luv\s*u|luv\s*ya)[\s\w,.!?]*$/i,

  // Combos
  /^(ok+|okay)[,.]?\s*(thanks?|bye|see\s*ya|take\s*care|got\s*it)[\s\w,.!?]*$/i,
  /^(thanks?|thx)[,.]?\s*(bye|goodbye|see\s*ya|take\s*care|good\s*(day|night))[\s\w,.!?]*$/i,
  /^(ok+\s*thanks?\s*(so\s*much|a\s*lot|very\s*much)?)[\s\w,.!?]*$/i,
  /^(thank\s*you\s*(so\s*much)?\s*(bye|goodbye|take\s*care)?)[\s\w,.!?]*$/i,
  /^(love\s*(you|ya|u)\s*(bye|goodbye|take\s*care)?)[\s\w,.!?]*$/i,
  /^(hey+\s*(love|baby|babe)\s*thank\s*you(\s*so\s*much)?(\s*love\s*(you|ya|u))?)[\s\w,.!?]*$/i,

  // Reactions
  /^(wow+|woah+|whoa+|omg|oh\s*my\s*(god|gosh)|oh\s*wow)[\s\w,.!?]*$/i,
  /^(haha+|lol+|lmao+|hehe+|hihi+)[\s\w,.!?]*$/i,
  /^(no\s*(problem|worries|issue)|you'?re?\s*welcome|yw|np)[\s\w,.!?]*$/i,
  /^(sure+|of\s*course|absolutely|definitely|certainly)[\s\w,.!?]*$/i,
  /^(interesting|fascinating|that'?s?\s*(interesting|cool|amazing|helpful|great))[\s\w,.!?]*$/i,

  // Test inputs
  /^(test|testing|test\s*\d*|hello\s*world|ping)[\s\w,.!?]*$/i,
  /^(are\s*you\s*(there|working|online|alive|awake))[\s\w,.!?]*$/i,
  /^(can\s*you\s*hear\s*me|is\s*(this|it)\s*working)[\s\w,.!?]*$/i,
];

// ── FACTUAL PATTERNS ──────────────────────────────────────────────────────────
const FACTUAL_PATTERNS = [
  /^(what is|what are|what was|what were)\s/i,
  /^(who is|who was|who are|who were)\s/i,
  /^(when is|when was|when did|when does)\s/i,
  /^(where is|where are|where was)\s/i,
  /^(how many|how much|how tall|how old|how far|how long)\s/i,
  /^(define|definition of|meaning of)\s/i,
  /\bwhat is\s+[\d\s\+\-\*\/\^\(\)]+\??/i,
  /\b\d+\s*[\+\-\*\/]\s*\d+/i,
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
  const wordCount = text.trim().split(/\s+/).length;
  let score       = 0;

  if (wordCount <= 8)  score += 10;
  if (wordCount <= 20) score += 10;
  if (wordCount > 20)  score += 20;
  if (wordCount > 40)  score += 15;
  if (wordCount > 60)  score += 10;

  score += COMPLEX_PATTERNS.filter(p => p.test(t)).length * 20;
  score += CODE_PATTERNS.filter(p => p.test(t)).length * 10;
  score -= SIMPLE_PATTERNS.filter(p => p.test(t)).length * 15;

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  if (sentences > 2) score += 10;
  if (sentences > 4) score += 10;
  if (/^(what|who|when|where|which)\b/i.test(t)) score -= 5;

  return Math.max(0, Math.min(100, score));
}

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

// ── Sync classify — rules only ────────────────────────────────────────────────

export function classify(prompt) {
  const t         = prompt.toLowerCase().trim();
  const wordCount = prompt.trim().split(/\s+/).length;

  if (FILLER_PATTERNS.some(p => p.test(t))) {
    return { label:"FILLER", confidence:0.99, wordCount, score:0, path:"X", method:"rules" };
  }
  if (FACTUAL_PATTERNS.some(p => p.test(t))) {
    return { label:"FACTUAL", confidence:computeConfidence("FACTUAL",0,t), wordCount, score:0, path:"C", method:"rules" };
  }
  if (KNOWLEDGE_PATTERNS.some(p => p.test(t))) {
    const score = complexityScore(prompt);
    const label = score >= 55 ? "COMPLEX" : "MODERATE";
    return { label, confidence:0.85, wordCount, score, path:label==="COMPLEX"?"B":"A", method:"rules" };
  }
  const score = complexityScore(prompt);
  let label;
  if (score < 25)      label = "SIMPLE";
  else if (score < 55) label = "MODERATE";
  else                 label = "COMPLEX";
  return { label, confidence:computeConfidence(label,score,t), wordCount, score, path:label==="COMPLEX"?"B":"A", method:"rules" };
}

// ── LLM classifier system prompt ─────────────────────────────────────────────

const CLASSIFY_SYSTEM_PROMPT = `You are a prompt classification engine.
Classify the given prompt into exactly ONE of these 5 categories:

FILLER    — Greetings, farewells, thank yous, acknowledgements, small talk, affection.
            Examples: "hey how are you", "thanks so much", "ok cool", "bye take care",
            "hey love how are you today", "good morning", "lol ok", "sounds good",
            "i love you", "miss you", "hope you are doing well", "you're amazing".

FACTUAL   — Google-able facts. Math, capital cities, who is X, population, price.

SIMPLE    — Single clear action, no reasoning. Fix spelling, translate, rename, format.

MODERATE  — Needs reasoning. Write a function, explain X, SQL query, React component.

COMPLEX   — Multi-step, architecture, system design, security audit, algorithm from scratch.

Rules:
1. Reply with ONLY one word: FILLER, FACTUAL, SIMPLE, MODERATE, or COMPLEX
2. No explanation. No punctuation. Nothing else.
3. ANY greeting, farewell, thank you, or small talk = FILLER
4. Math = ALWAYS FACTUAL
5. Single function = MODERATE not COMPLEX`;

async function callLLMClassifier(prompt, engine) {
  try {
    const response = await engine.chat.completions.create({
      messages: [
        { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
        { role: "user",   content: `Classify into one word only:\n${prompt}` },
      ],
      temperature: 0.0,
      max_tokens:  5,
    });
    const raw   = response.choices[0]?.message?.content?.trim().toUpperCase();
    const valid = ["FILLER", "FACTUAL", "SIMPLE", "MODERATE", "COMPLEX"];
    const found = valid.find(v => raw.includes(v));
    console.log(`[EcoPrompt] LLM classified: ${found ?? "null"} (raw: "${raw}")`);
    return found ?? null;
  } catch (err) {
    console.warn("[EcoPrompt] LLM classify failed:", err.message);
    return null;
  }
}

// ── Async classify with LLM ───────────────────────────────────────────────────

export async function classifyWithLLM(prompt, engine) {
  const t         = prompt.toLowerCase().trim();
  const wordCount = prompt.trim().split(/\s+/).length;

  // ── FILLER: always rules — never waste LLM on small talk ─────────────────
  if (FILLER_PATTERNS.some(p => p.test(t))) {
    console.log("[EcoPrompt] FILLER via rules — LLM skipped");
    return { label:"FILLER", confidence:0.99, wordCount, score:0, path:"X", method:"rules" };
  }

  // ── FACTUAL: rules are perfect here ──────────────────────────────────────
  if (FACTUAL_PATTERNS.some(p => p.test(t))) {
    console.log("[EcoPrompt] FACTUAL via rules");
    return { label:"FACTUAL", confidence:computeConfidence("FACTUAL",0,t), wordCount, score:0, path:"C", method:"rules" };
  }

  // ── No engine — fall back to rules ───────────────────────────────────────
  if (!engine) return { ...classify(prompt), method:"rules" };

  // ── LLM for MODERATE/COMPLEX boundary ────────────────────────────────────
  const llmLabel = await callLLMClassifier(prompt, engine);
  if (!llmLabel) return { ...classify(prompt), method:"rules-fallback" };

  const score = complexityScore(prompt);
  const path  = llmLabel === "COMPLEX" ? "B" : llmLabel === "FACTUAL" ? "C" : llmLabel === "FILLER" ? "X" : "A";
  return { label:llmLabel, confidence:0.93, wordCount, score, path, method:"llm" };
}
