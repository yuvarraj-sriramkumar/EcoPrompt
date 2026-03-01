// src/utils/carbon.js

const ENERGY_PER_TOKEN_WH = {
  'gpt-4':         0.00175,
  'claude-opus':   0.00180,
  'claude-sonnet': 0.00090,
  'gemini-pro':    0.00100,
  'claude-haiku':  0.00018,
  'gemini-flash':  0.00018,
  'gpt-3.5-turbo': 0.00050,
};

const GRID_INTENSITY_KG_PER_WH = 0.000233; // US avg

export function calculateSavings(originalTokens, compressedTokens, model) {
  const tokensSaved  = Math.max(0, originalTokens - compressedTokens);
  const savingsPct   = originalTokens > 0
    ? Math.round((tokensSaved / originalTokens) * 100)
    : 0;

  const energyPerToken = ENERGY_PER_TOKEN_WH[model] ?? ENERGY_PER_TOKEN_WH['claude-haiku'];
  const whSaved        = tokensSaved * energyPerToken;
  const co2Grams       = whSaved * GRID_INTENSITY_KG_PER_WH * 1000;
  const waterMl        = tokensSaved * 0.0015;

  return {
    originalTokens,
    compressedTokens,
    tokensSaved,
    savingsPct,
    whSaved,
    co2Grams,
    waterMl,
    equiv: {
      treeDays:           co2Grams / 21.77,
      carMiles:           co2Grams / 404,
      smartphoneCharges:  co2Grams / 8.22,
    },
    model,
    efficiencyScore: Math.min(100, savingsPct * 1.5),
  };
}