// src/agents/skipAI.js
// PATH C — skip AI entirely for factual queries
// Member A calls: isLikelyFactual(prompt) and skipAISearch(prompt) from worker.js

const GOOGLE_API_KEY = "AIzaSyAEDqRAI96ERUZlSb3aquXfW8pp8fxkrQA";  // get from console.cloud.google.com
const GOOGLE_CSE_ID  = "34a49f1c0ea654514";  // get from cse.google.com

export function isLikelyFactual(prompt) {
  const t = prompt.toLowerCase().trim();
  return [
    /^(what is|what are|what was|what were)\s/,
    /^(who is|who was|who are|who were)\s/,
    /^(when is|when was|when did|when does)\s/,
    /^(where is|where are|where was)\s/,
    /^(how many|how much|how tall|how old|how far)\s/,
    /\b(capital of|population of|founded in|born in)\b/,
  ].some(p => p.test(t));
}

export async function skipAISearch(prompt) {
  const query = prompt
    .replace(/^(hey|hi|tell me|can you|could you|please|help me)\s*/i, "")
    .trim();

  if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) {
    return {
      results: [
        {
          title:   "Search Google",
          snippet: "Click to search Google directly.",
          link:    `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        },
      ],
      query,
      source:      "fallback",
      skipSavings: { totalTokens: 120, note: "Bypassed AI — used web search" },
    };
  }

  try {
    const url  = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CSE_ID}&q=${encodeURIComponent(query)}&num=5`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();

    const results = (data.items || []).map(item => ({
      title:   item.title,
      snippet: item.snippet,
      link:    item.link,
    }));

    return {
      results,
      query,
      source:      "google",
      skipSavings: { totalTokens: 120, note: "Bypassed AI — used web search" },
    };

  } catch (err) {
    return {
      results: [
        {
          title:   "Search Google",
          snippet: "Search failed — click to search Google directly.",
          link:    `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        },
      ],
      query,
      source:      "error",
      skipSavings: { totalTokens: 0, note: "Search failed" },
    };
  }
}