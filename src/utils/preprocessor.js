// src/utils/preprocessor.js
// Two-layer prompt cleaner — rules first, then WebLLM contextual fix

const SPELL_MAP = {
  "wat": "what", "wats": "what is", "whats": "what is",
  "wht": "what", "wen": "when", "wer": "where",
  "hw": "how", "hwo": "how",
  "bcz": "because", "bcoz": "because", "coz": "because",
  "plz": "please", "pls": "please",
  "thx": "thanks", "thnx": "thanks",
  "u": "you", "ur": "your", "r": "are",
  "n": "and", "nd": "and", "abt": "about",
  "b4": "before", "2day": "today", "2morrow": "tomorrow",
  "diff": "difference", "btwn": "between", "btw": "between",
  "ans": "answer", "ques": "question",
  "prob": "problem", "probs": "problems",
  "defn": "definition", "info": "information",
  "lang": "language", "langs": "languages",
  "fn": "function", "func": "function",
  "db": "database", "repo": "repository",
  "config": "configuration", "msg": "message",
  "msgs": "messages",
};

const PREPROCESS_SYSTEM_PROMPT = `You are a prompt cleaning engine. Extract ONLY the core question or task. Be minimal.

Rules:
1. Remove ALL greetings: hey, hi, hello, how are you
2. Remove ALL casual address: baby, love, babe, buddy, dude
3. Remove ALL preamble: "help me with my homework", "can you assist me", "I need help with my math", "help me with my"
4. Fix spelling using context — "captionnnnn of india" → "capital of India"
5. Keep ONLY the core question or task — nothing else
6. If it contains math like "2+2", output ONLY "What is 2+2?"
7. If it is a task, start with imperative verb: Write, Explain, Fix, Build
8. Return ONLY the cleaned question or task — no notes, no explanation, nothing else

Examples:
Input:  "heyy baby help me with my math homework what is 2+2"
Output: What is 2+2?

Input:  "hi can you help me understand what is machine learning"
Output: What is machine learning?

Input:  "hey bro write me a python function to sort a list"
Output: Write a Python function to sort a list.

Input:  "captionnnnn of india"
Output: What is the capital of India?

Input:  "I was wondering if you could help me write a SQL query joining 3 tables in PostgreSQL"
Output: Write a SQL query joining 3 tables in PostgreSQL.`;

export function ruleClean(text) {
  let out = text;

  // Normalize repeated chars — "heyyyy" → "hey"
  out = out.replace(/(.)\1{2,}/g, "$1");

  // Remove greeting at start
  out = out.replace(/^(hey+|hi+|hello+|howdy|yo)[,!.]?\s*/i, "");

  // Remove casual address words anywhere
  out = out.replace(/\b(love|baby|babe|buddy|mate|dude|bro|dear|darling|sweetheart)\b[,.]?\s*/gi, "");

  // Remove "help me with my X" preamble patterns — most common cause of noise
  out = out.replace(/^(can you |could you |please )?(help me with my |help me with |assist me with |help me understand |help me )\w[\w\s]*(homework|assignment|question|problem|task|math|code|project)[,.]?\s*/i, "");

  // Remove generic openers
  out = out.replace(/^(could you please|please kindly|I was wondering if you could|I would like you to|I want you to|can you please|I need you to|could you|can you|please|help me)\s*/i, "");

  // Remove inline filler
  out = out.replace(/\b(please|kindly|basically|essentially|literally|actually|honestly|simply|just|kind of|sort of|maybe|perhaps|really|very)\b\s*/gi, "");

  // Remove opinion phrases
  out = out.replace(/\b(I think|I believe|I feel like|in my opinion|I guess)\b\s*/gi, "");

  // Remove trailing filler
  out = out.replace(/[.,]?\s*(thanks?( you)?|thank you|cheers|appreciate it)[.!]?\s*$/i, "");

  // Remove conversation starters
  out = out.replace(/^(so|well|now|okay|ok)[,]?\s*/i, "");

  // Apply spell map word by word
  out = out.split(/\s+/).map(word => {
    const lower = word.toLowerCase().replace(/[^a-z]/g, "");
    return SPELL_MAP[lower] ?? word;
  }).join(" ");

  // Clean punctuation noise
  out = out.replace(/[!?]{2,}/g, "?");
  out = out.replace(/\.{2,}/g, " ");
  out = out.replace(/,{2,}/g, ",");
  out = out.replace(/\s{2,}/g, " ").trim();

  // Capitalize first letter
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export async function preprocessWithLLM(rawPrompt, engine) {
  // Always run rules first
  const ruleResult = ruleClean(rawPrompt);

  // If rules already produced a clean short result — skip LLM entirely
  // This prevents LLM from answering simple questions like "What is 2+2?"
  if (!engine || ruleResult.split(/\s+/).length <= 8) {
    return {
      cleaned:     ruleResult,
      method:      "rules",
      original:    rawPrompt,
      wasModified: ruleResult.trim() !== rawPrompt.trim(),
    };
  }

  try {
    const response = await engine.chat.completions.create({
      messages: [
        { role: "system", content: PREPROCESS_SYSTEM_PROMPT },
        { role: "user",   content: `Clean this prompt:\n${ruleResult}` },
      ],
      temperature: 0.0,
      max_tokens:  80, // hard cap — cleaned prompt should never be long
    });

    const llmCleaned = response.choices[0]?.message?.content?.trim();

    // Reject LLM output if it looks like an answer or explanation
    const isRogue = !llmCleaned ||
      llmCleaned.length < 3 ||
      /[-–]\s*(answer|explanation|note|result)\s*:/i.test(llmCleaned) ||
      /\(note:/i.test(llmCleaned) ||
      /the (cleaned|original|prompt) (removes|maintains|contains)/i.test(llmCleaned) ||
      estimateWords(llmCleaned) > estimateWords(ruleResult) + 5;

    if (isRogue) {
      console.warn("[EcoPrompt] Preprocessor LLM went rogue — using rules");
      return {
        cleaned:     ruleResult,
        method:      "rules-fallback",
        original:    rawPrompt,
        wasModified: ruleResult.trim() !== rawPrompt.trim(),
      };
    }

    return {
      cleaned:     llmCleaned,
      method:      "llm",
      original:    rawPrompt,
      wasModified: llmCleaned.trim() !== rawPrompt.trim(),
    };

  } catch (err) {
    console.warn("[EcoPrompt] Preprocess LLM failed:", err.message);
    return {
      cleaned:     ruleResult,
      method:      "rules-fallback",
      original:    rawPrompt,
      wasModified: ruleResult.trim() !== rawPrompt.trim(),
    };
  }
}

function estimateWords(text) {
  return text.trim().split(/\s+/).length;
}
