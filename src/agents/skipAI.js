// src/agents/skipAI.js
// No API key needed at all

export async function searchGoogle(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1`;

  try {
    const res  = await fetch(url);
    const data = await res.json();

    // DDG returns RelatedTopics as results
    const results = (data.RelatedTopics ?? [])
      .filter(r => r.FirstURL) // remove category headers
      .slice(0, 5)
      .map(r => ({
        title:   r.Text?.split(' - ')[0] ?? 'Result',
        snippet: r.Text ?? '',
        url:     r.FirstURL,
      }));

    // If no related topics, try the abstract
    if (results.length === 0 && data.AbstractURL) {
      results.push({
        title:   data.Heading,
        snippet: data.Abstract,
        url:     data.AbstractURL,
      });
    }

    return results;

  } catch (err) {
    console.error('[EcoPrompt] DDG fetch failed:', err);
    return [];
  }
}

