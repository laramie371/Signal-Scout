import { scoreItem, type ScoreResult } from "./scoring";
import type { AiMatchReview, Opportunity, Project } from "../types/project";

export interface FeedItem {
  id: string;
  title: string;
  description: string;
  content: string;
  feedTitle: string;
  feedUrl: string;
  author: string;
  link: string;
  pubDate: string;
}

export type ScanOptions = {
  minimumOpportunityScore: number;
  postsPerFeed: number;
  maxFeedAgeDays: number;
  openAiKey: string;
  openAiModel: string;
  enableAiMatchReview: boolean;
  aiReviewThreshold: number;
  maxAiReviewsPerScan: number;
  aiReviewMode: "top_n" | "all";
  keywordMatchMode: "high_recall" | "exact_phrase";
  onAiReviewProgress?: (progress: AiReviewProgress) => void;
};

export type AiReviewProgress = {
  totalReviewTargets: number;
  reviewedCount: number;
  failedCount: number;
  remainingCount: number;
  reviewedOpportunities?: Opportunity[];
};

const AI_REVIEW_BATCH_SIZE = 5;

type ReviewCandidate = {
  item: FeedItem;
  project: Project;
  scored: ScoreResult;
  aiReview?: AiMatchReview;
  aiReviewFailed?: boolean;
  aiReviewError?: string;
};

export async function scanFeedsForProjects(projects: Project[], options: ScanOptions): Promise<Opportunity[]> {
  if (!window.signalScout?.rssScan) {
    throw new Error("RSS scanning requires the Electron app runtime.");
  }

  const seen = new Set<string>();
  const candidates: ReviewCandidate[] = [];

  for (const project of projects) {
    const feeds = buildFeeds(project);
    if (feeds.length === 0) continue;

    const payload = { feeds, limitPerFeed: options.postsPerFeed };
    console.log("[Signal Scout] scan payload", { projectId: project.id, projectName: project.name, ...payload });

    const result = await window.signalScout.rssScan(payload);
    console.log("[Signal Scout] raw results count", {
      projectId: project.id,
      count: result.items?.length || 0,
      errors: result.errors || [],
      error: result.error,
    });
    if (!result.ok) {
      throw new Error(result.error || "RSS scan failed in Electron main process.");
    }

    let filteredCount = 0;
    for (const item of result.items || []) {
      const key = `${project.id}:${item.id || item.link}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (!isWithinMaxAge(item.pubDate, options.maxFeedAgeDays)) continue;

      const scored = scoreItem(item, project, { keywordMatchMode: options.keywordMatchMode });
      if (scored.matchedKeywords.length === 0) continue;
      if (scored.avoidedKeywords.length > 0) continue;

      candidates.push({ item, project, scored });
      filteredCount += 1;
    }

    console.log("[Signal Scout] filtered results count", { projectId: project.id, count: filteredCount });
  }

  await reviewCandidatesWithAi(candidates, options);

  return candidates
    .map((candidate) => buildOpportunity(candidate))
    .sort((a, b) => b.score - a.score || new Date(b.foundAt).getTime() - new Date(a.foundAt).getTime())
    .slice(0, 1000);
}

function buildFeeds(project: Project): string[] {
  return (project.feeds || [])
    .map((feed) => feed.trim())
    .filter(Boolean)
    .filter((feed, index, all) => all.indexOf(feed) === index)
    .slice(0, 60);
}

function buildOpportunity(candidate: ReviewCandidate): Opportunity {
  const { item, project, scored, aiReview } = candidate;
  const matched = scored.matchedKeywords;
  const sourceName = cleanFeedTitle(item.feedTitle, item.feedUrl);

  return {
    id: `${project.id}-${item.id || hashString(item.link)}`,
    projectId: project.id,
    title: item.title,
    source: "RSS",
    subreddit: sourceName,
    url: item.link,
    score: scored.score,
    matchedKeywords: matched,
    avoidedKeywords: scored.avoidedKeywords,
    summary: item.content
      ? trimText(item.content, 280)
      : "Open the source to review the full conversation before replying.",
    status: "new",
    foundAt: parseDate(item.pubDate),
    intent: aiReview?.isOpportunity && aiReview.opportunityType !== "not_relevant" ? aiReview.opportunityType : scored.intent,
    intentScore: scored.intentScore,
    matchExplanation: scored.explanation,
    aiReviewed: Boolean(aiReview),
    aiMatchStrength: aiReview?.matchScore,
    matchStrength: aiReview?.matchStrength,
    actionSignalStrength: aiReview?.actionSignalStrength,
    aiRisk: aiReview?.risk,
    aiReviewReason: aiReview?.reason,
    aiReviewFailed: candidate.aiReviewFailed,
    aiReviewError: candidate.aiReviewError,
  };
}

async function reviewCandidatesWithAi(candidates: ReviewCandidate[], options: ScanOptions) {
  if (!window.signalScout?.openAiReviewOpportunity) return;
  if (!options.openAiKey || !options.enableAiMatchReview) return;

  const eligibleCandidates = candidates.filter((candidate) => candidate.scored.score >= options.aiReviewThreshold);
  const reviewTargets = options.aiReviewMode === "all"
    ? eligibleCandidates
    : eligibleCandidates.slice(0, options.maxAiReviewsPerScan);
  const progress: AiReviewProgress = {
    totalReviewTargets: reviewTargets.length,
    reviewedCount: 0,
    failedCount: 0,
    remainingCount: reviewTargets.length,
  };

  console.log("[Signal Scout] AI review targets", progress);
  options.onAiReviewProgress?.(progress);

  for (const batch of chunk(reviewTargets, AI_REVIEW_BATCH_SIZE)) {
    const settled = await Promise.allSettled(batch.map((candidate) => reviewSingleCandidateWithAi(candidate, options)));

    settled.forEach((result, index) => {
      const candidate = batch[index];
      if (result.status === "fulfilled" && result.value) {
        candidate.aiReview = result.value;
        candidate.aiReviewFailed = false;
        candidate.aiReviewError = undefined;
        progress.reviewedCount += 1;
      } else {
        candidate.aiReviewFailed = true;
        candidate.aiReviewError = result.status === "rejected"
          ? formatReviewError(result.reason)
          : "AI review returned no result.";
        progress.failedCount += 1;
      }
    });

    progress.remainingCount = Math.max(0, progress.totalReviewTargets - progress.reviewedCount - progress.failedCount);
    console.log("[Signal Scout] AI review progress", progress);
    options.onAiReviewProgress?.({
      ...progress,
      reviewedOpportunities: batch.map((candidate) => buildOpportunity(candidate)),
    });
  }
}

async function reviewSingleCandidateWithAi(candidate: ReviewCandidate, options: ScanOptions) {
  const { item, project, scored } = candidate;
  // Cost-control: AI match review is opt-in and only runs after local scoring has already found
  // a strong candidate. This avoids sending every RSS item to OpenAI during scans.
  const result = await window.signalScout?.openAiReviewOpportunity({
    apiKey: options.openAiKey,
    model: options.openAiModel,
    project: {
      name: project.name,
      description: project.description,
      keywords: project.keywords,
      avoidKeywords: project.avoidKeywords,
      responseStyle: project.responseStyle,
    },
    opportunity: {
      title: item.title,
      summary: trimText(item.content, 600),
      source: item.feedTitle,
      url: item.link,
      matchedKeywords: scored.matchedKeywords,
      score: scored.score,
      intent: scored.intent,
      matchExplanation: scored.explanation,
    },
  });

  if (!result?.ok || !result.review) {
    throw new Error(result?.error || "AI review returned no result.");
  }

  return result.review;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function formatReviewError(error: unknown) {
  return error instanceof Error ? error.message : "AI review failed.";
}

function cleanFeedTitle(title: string, feedUrl: string) {
  const trimmed = title.trim();
  if (trimmed) return trimmed.replace(/^new on /i, "").replace(/^reddit:\s*/i, "");

  const redditMatch = feedUrl.match(/reddit\.com\/r\/([^/]+)/i);
  if (redditMatch) return `r/${redditMatch[1]}`;

  try {
    return new URL(feedUrl).hostname;
  } catch {
    return "RSS feed";
  }
}

function trimText(value: string, maxLength: number) {
  const compact = stripHtml(value).replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trim()}…`;
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function isWithinMaxAge(pubDate: string, maxAgeDays: number) {
  const time = new Date(pubDate).getTime();
  if (!Number.isFinite(time)) return true;
  return Date.now() - time <= 1000 * 60 * 60 * 24 * maxAgeDays;
}

function parseDate(pubDate: string) {
  const time = new Date(pubDate).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : new Date().toISOString();
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
