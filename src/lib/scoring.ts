import type { KeywordMatchMode, LeadIntent, Project } from "../types/project";

export type ScorableItem = {
  title: string;
  description?: string;
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

export type ScoreOptions = {
  keywordMatchMode: KeywordMatchMode;
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
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "for",
  "and",
  "or",
  "is",
  "are",
  "of",
  "with",
  "my",
  "your",
  "our",
  "on",
  "in",
  "at",
  "from",
  "by",
  "how",
]);

// Signal Scout intentionally avoids sending every feed item to OpenAI. First we use cheap deterministic
// scoring so scans stay fast, private, and inexpensive. Only posts that pass the configured AI review
// threshold are optionally sent for deeper AI match review.
export function expandKeywords(keywords: string[]): string[] {
  return [...new Set(
    keywords
      .flatMap((keyword) => keyword.toLowerCase().split(/\s+/))
      .map((word) => word.trim())
      .filter(Boolean)
      .filter((word) => !STOP_WORDS.has(word)),
  )];
}

export function scoreItem(item: ScorableItem, project: Project, options: ScoreOptions): ScoreResult {
  const title = item.title.toLowerCase();
  const description = (item.description || "").toLowerCase();
  const body = item.content.toLowerCase();
  const feedTitle = item.feedTitle.toLowerCase();
  const matchedKeywords: string[] = [];
  const avoidedKeywords: string[] = [];
  const explanation: string[] = [];
  let keywordScore = 0;

  if (options.keywordMatchMode === "high_recall") {
    const expandedTerms = expandKeywords(project.keywords);
    console.log("[Signal Scout] project terms", { projectId: project.id, terms: expandedTerms });

    for (const term of expandedTerms) {
      let matched = false;

      if (containsWord(title, term)) {
        keywordScore += 10;
        matched = true;
        explanation.push(`Term "${term}" matched in title (+10)`);
      }

      if (containsWord(body, term)) {
        keywordScore += 3;
        matched = true;
        explanation.push(`Term "${term}" matched in content (+3)`);
      }

      if (containsWord(description, term)) {
        keywordScore += 5;
        matched = true;
        explanation.push(`Term "${term}" matched in description (+5)`);
      }

      if (containsWord(feedTitle, term)) {
        keywordScore += 5;
        matched = true;
        explanation.push(`Term "${term}" matched feed/source (+5)`);
      }

      if (matched) matchedKeywords.push(term);
    }
  }

  for (const keyword of project.keywords) {
    const normalized = keyword.toLowerCase().trim();
    if (!normalized) continue;

    const titleMatch = title.includes(normalized);
    const descriptionMatch = description.includes(normalized);
    const bodyMatch = body.includes(normalized);
    const feedMatch = feedTitle.includes(normalized);
    if (!titleMatch && !descriptionMatch && !bodyMatch && !feedMatch) continue;

    if (normalized.includes(" ")) {
      keywordScore += 25;
      explanation.push(`Exact phrase "${keyword}" matched (+25)`);
    }

    if (options.keywordMatchMode === "exact_phrase") {
      matchedKeywords.push(keyword);
      if (titleMatch) {
        keywordScore += 30;
        explanation.push(`Keyword "${keyword}" matched in title (+30)`);
      }

      if (bodyMatch) {
        keywordScore += 10;
        explanation.push(`Keyword "${keyword}" matched in body (+10)`);
      }

      if (descriptionMatch) {
        keywordScore += 5;
        explanation.push(`Keyword "${keyword}" matched in description (+5)`);
      }

      if (feedMatch) {
        keywordScore += 5;
        explanation.push(`Keyword "${keyword}" matched feed/source (+5)`);
      }
    } else if (!matchedKeywords.includes(keyword) && (titleMatch || descriptionMatch || bodyMatch || feedMatch)) {
      matchedKeywords.push(keyword);
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
  const uniqueMatchedKeywords = [...new Set(matchedKeywords)];

  console.log("[Signal Scout] keyword match debug", {
    post: item.title,
    matched: uniqueMatchedKeywords,
    score,
  });

  return {
    score,
    keywordScore,
    intentScore: intent.intentScore,
    matchedKeywords: uniqueMatchedKeywords,
    avoidedKeywords,
    intent: intent.intent,
    explanation: [...explanation, ...intent.explanation],
  };
}

function containsWord(value: string, term: string) {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}([^a-z0-9]|$)`, "i").test(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
