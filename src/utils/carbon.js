// src/utils/carbon.js
// Full CO2 math pipeline
// Member C reads: buildStats() → StatsObject → renders dashboard

import { tokenDiff } from "./tokenizer.js";

const MODEL_ENERGY = {
  "gpt-4":         0.00175,
  "gpt-4o":        0.00140,
  "gpt-3.5":       0.00050,
  "claude-opus":   0.00180,
  "claude-sonnet": 0.00090,
  "claude-haiku":  0.00018,
  "gemini-pro":    0.00100,
  "gemini-flash":  0.00018,
  "default":       0.00090,
};

const GRID_KG_CO2_PER_KWH = 0.386;
const WATER_ML_PER_WH     = 1.8;

function calcWh(tokensSaved, modelKey) {
  const rate = MODEL_ENERGY[modelKey] ?? MODEL_ENERGY["default"];
  return tokensSaved * rate;
}

function calcCO2(wh) {
  return (wh / 1000) * GRID_KG_CO2_PER_KWH * 1000;
}

function calcWater(wh) {
  return wh * WATER_ML_PER_WH;
}

function calcEquiv(co2Grams) {
  const kg = co2Grams / 1000;
  return {
    treeDays:          +(kg / 0.060).toFixed(5),
    carMiles:          +(kg / 0.404).toFixed(6),
    smartphoneCharges: +(kg / 0.008).toFixed(4),
  };
}

function efficiencyScore(savingsPct) {
  return Math.max(0, Math.min(100, Math.round(100 - savingsPct * 0.85)));
}

export function buildStats(originalText, compressedText, modelKey = "default") {
  const diff  = tokenDiff(originalText, compressedText, modelKey);
  const wh    = calcWh(diff.saved, modelKey);
  const co2   = calcCO2(wh);
  const water = calcWater(wh);

  return {
    originalTokens:   diff.original,
    compressedTokens: diff.compressed,
    tokensSaved:      diff.saved,
    savingsPct:       diff.savingsPct,
    whSaved:          +wh.toFixed(6),
    co2Grams:         +co2.toFixed(4),
    waterMl:          +water.toFixed(4),
    equiv:            calcEquiv(co2),
    efficiencyScore:  efficiencyScore(diff.savingsPct),
    model:            modelKey,
  };
}

export function addToLifetime(existing = {}, newStats) {
  return {
    totalTokensSaved: (existing.totalTokensSaved || 0) + newStats.tokensSaved,
    totalCO2Grams:    (existing.totalCO2Grams    || 0) + newStats.co2Grams,
    totalWaterMl:     (existing.totalWaterMl     || 0) + newStats.waterMl,
    totalWhSaved:     (existing.totalWhSaved     || 0) + newStats.whSaved,
    compressionCount: (existing.compressionCount || 0) + 1,
  };
}