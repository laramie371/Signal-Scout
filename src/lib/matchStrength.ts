import type { MatchStrength, Opportunity } from "../types/project";

export function normalizeMatchStrength(value: unknown, score?: number): MatchStrength {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["high", "strong", "great", "perfect", "very relevant"].includes(normalized)) return "high";
    if (["medium", "maybe", "possible", "decent", "relevant"].includes(normalized)) return "medium";
    if (["low", "weak", "poor", "stretch", "not relevant"].includes(normalized)) return "low";
  }

  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric)) return strengthFromScore(numeric);
  return strengthFromScore(score || 0);
}

export function getOpportunityMatchStrength(opportunity: Opportunity): MatchStrength {
  return opportunity.matchStrength || normalizeMatchStrength(opportunity.aiMatchStrength, opportunity.score);
}

export function strengthFromScore(score: number): MatchStrength {
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export function getMatchStrengthLabel(strength: MatchStrength) {
  if (strength === "high") return "Strong match";
  if (strength === "medium") return "Maybe match";
  return "Low match";
}

export function getMatchStrengthClass(strength: MatchStrength) {
  return `match-strength-${strength}`;
}

export function getMatchStrengthRank(strength: MatchStrength) {
  if (strength === "high") return 3;
  if (strength === "medium") return 2;
  return 1;
}

export function normalizeActionSignalStrength(value: unknown, fallbackScore?: number): MatchStrength {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["strong", "high", "actionable", "good lead"].includes(normalized)) return "high";
    if (["maybe", "possible", "moderate", "medium"].includes(normalized)) return "medium";
    if (["weak", "skip", "poor", "not actionable", "low"].includes(normalized)) return "low";
  }

  return strengthFromScore(fallbackScore || 0);
}

export function getOpportunityActionSignalStrength(opportunity: Opportunity): MatchStrength {
  return normalizeActionSignalStrength(
    opportunity.actionSignalStrength,
    opportunity.aiMatchStrength ?? opportunity.score,
  );
}

export function getActionSignalLabel(strength: MatchStrength) {
  if (strength === "high") return "Strong action signal";
  if (strength === "medium") return "Maybe action signal";
  return "Low action signal";
}

export function getActionSignalClass(strength: MatchStrength) {
  return `action-signal-${strength}`;
}

export function getActionSignalRank(strength: MatchStrength) {
  return getMatchStrengthRank(strength);
}
