import type { LeadIntent, Project } from "../types/project";

export type ScorableItem = {
  title: string;
  content: string;
  feedTitle: string;
};

export type ScoreResult = {
  score: number;
  keywordScore: number;
  intentScore: number;
  matchedKeywords: string[];
  avoidedKeywords: string[];
  intent: LeadIntent;
  explanation: string[];
};

const POSITIVE_INTENT_PHRASES = [
  "how do i",
  "how can i",
  "need help",
  "looking for",
  "any tool",
  "recommend",
  "recommendation",
  "best way",
  "does anyone know",
  "can't figure out",
  "problem with",
  "is there a way",
  "what should i use",
  "trying to",
];

const NEGATIVE_INTENT_PHRASES = [
  "look what i made",
  "showoff",
  "showcase",
  "meme",
  "joke",
  "news",
  "announcement",
  "rant",
  "hiring",
  "job",
  "internship",
  "resume",
  "politics",
];

const TOOL_PHRASES = ["any tool", "is there a tool", "what tool", "what should i use"];
const RECOMMENDATION_PHRASES = ["recommend", "recommendation", "looking for", "best way"];
const BUYING_PHRASES = ["pricing", "paid", "buy", "purchase", "worth it", "alternative to"];
const SUPPORT_PHRASES = ["how do i", "how can i", "need help", "can't figure out", "problem with", "trying to"];

// Signal Scout intentionally avoids sending every feed item to OpenAI. First we use cheap deterministic
// scoring so scans stay fast, private, and inexpensive. Only posts that pass the configured AI review
// threshold are optionally sent for deeper AI match review.
export function scoreItem(item: ScorableItem, project: Project): ScoreResult {
  const title = item.title.toLowerCase();
  const body = item.content.toLowerCase();
  const feedTitle = item.feedTitle.toLowerCase();
  const matchedKeywords: string[] = [];
  const avoidedKeywords: string[] = [];
  const explanation: string[] = [];
  let keywordScore = 0;

  for (const keyword of project.keywords) {
    const normalized = keyword.toLowerCase().trim();
    if (!normalized) continue;

    const titleMatch = title.includes(normalized);
    const bodyMatch = body.includes(normalized);
    if (!titleMatch && !bodyMatch) continue;

    matchedKeywords.push(keyword);
    if (titleMatch) {
      keywordScore += 30;
      explanation.push(`Keyword "${keyword}" matched in title (+30)`);
    }

    if (bodyMatch) {
      keywordScore += 10;
      explanation.push(`Keyword "${keyword}" matched in body (+10)`);
    }

    if (normalized.includes(" ")) {
      keywordScore += 20;
      explanation.push(`Multi-word phrase "${keyword}" matched (+20)`);
    }

    if (feedTitle.includes(normalized)) {
      keywordScore += 5;
      explanation.push(`Keyword "${keyword}" matched feed/source (+5)`);
    }
  }

  for (const keyword of project.avoidKeywords) {
    const normalized = keyword.toLowerCase().trim();
    if (!normalized) continue;
    if (!title.includes(normalized) && !body.includes(normalized)) continue;

    avoidedKeywords.push(keyword);
    keywordScore -= 40;
    explanation.push(`Avoid word "${keyword}" matched (-40)`);
  }

  const intent = detectIntent(title, body);
  const score = Math.max(0, Math.min(100, keywordScore + intent.intentScore));

  return {
    score,
    keywordScore,
    intentScore: intent.intentScore,
    matchedKeywords,
    avoidedKeywords,
    intent: intent.intent,
    explanation: [...explanation, ...intent.explanation],
  };
}

function detectIntent(title: string, body: string) {
  let intentScore = 0;
  const explanation: string[] = [];

  for (const phrase of POSITIVE_INTENT_PHRASES) {
    if (title.includes(phrase)) {
      intentScore += 25;
      explanation.push(`Positive intent "${phrase}" matched in title (+25)`);
    }
    if (body.includes(phrase)) {
      intentScore += 15;
      explanation.push(`Positive intent "${phrase}" matched in body (+15)`);
    }
  }

  for (const phrase of NEGATIVE_INTENT_PHRASES) {
    if (title.includes(phrase)) {
      intentScore -= 25;
      explanation.push(`Negative intent "${phrase}" matched in title (-25)`);
    }
    if (body.includes(phrase)) {
      intentScore -= 15;
      explanation.push(`Negative intent "${phrase}" matched in body (-15)`);
    }
  }

  return {
    intent: classifyIntent(title, body),
    intentScore,
    explanation,
  };
}

function classifyIntent(title: string, body: string): LeadIntent {
  const text = `${title}\n${body}`;
  if (matchesAny(text, ["hiring", "job", "internship", "resume"])) return "job_or_hiring";
  if (matchesAny(text, ["news", "announcement"])) return "news_or_announcement";
  if (matchesAny(text, ["look what i made", "showoff", "showcase"])) return "showcase";
  if (matchesAny(text, TOOL_PHRASES)) return "tool_request";
  if (matchesAny(text, BUYING_PHRASES)) return "buying_intent";
  if (matchesAny(text, RECOMMENDATION_PHRASES)) return "recommendation_request";
  if (matchesAny(text, SUPPORT_PHRASES)) return "support_question";
  if (text.trim()) return "discussion";
  return "not_clear";
}

function matchesAny(value: string, phrases: string[]) {
  return phrases.some((phrase) => value.includes(phrase));
}
