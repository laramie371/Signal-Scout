export interface Project {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  avoidKeywords: string[];
  feeds: string[];
  responseStyle: string;
  createdAt: string;
}

export type AppPage = "dashboard" | "projects" | "settings";
export type LeadIntent =
  | "support_question"
  | "recommendation_request"
  | "tool_request"
  | "buying_intent"
  | "discussion"
  | "showcase"
  | "job_or_hiring"
  | "news_or_announcement"
  | "not_clear";

export type AiRisk = "low" | "medium" | "high";
export type KeywordMatchMode = "high_recall" | "exact_phrase";
export type MatchStrength = "low" | "medium" | "high";
export type AiReviewMode = "top_n" | "all";

export interface AiResponse {
  shouldReply: boolean;
  confidence: number;
  reason: string;
  draft: string;
  generatedAt: string;
}

export interface Opportunity {
  id: string;
  projectId: string;
  title: string;
  source: string;
  subreddit: string;
  url: string;
  score: number;
  matchedKeywords: string[];
  avoidedKeywords: string[];
  summary: string;
  suggestedReply?: string;
  status: "new" | "saved" | "dismissed" | "responded";
  foundAt: string;
  lastSeenAt?: string;
  aiReason?: string;
  aiResponse?: AiResponse;
  intent?: LeadIntent;
  intentScore?: number;
  matchExplanation?: string[];
  aiReviewed?: boolean;
  aiMatchStrength?: number;
  matchStrength?: MatchStrength;
  aiRisk?: AiRisk;
  aiReviewReason?: string;
  isRead?: boolean;
  selected?: boolean;
}

export interface AppSettings {
  openAiKey: string;
  openAiModel: string;
  minimumOpportunityScore: number;
  postsPerFeed: number;
  maxFeedAgeDays: number;
  autoMarkReadSeconds: number;
  hideDismissed: boolean;
  hideResponded: boolean;
  enableAiMatchReview: boolean;
  aiReviewThreshold: number;
  maxAiReviewsPerScan: number;
  aiReviewMode: AiReviewMode;
  keywordMatchMode: KeywordMatchMode;
}

export interface ProjectSetupSuggestion {
  keywords: string[];
  avoidKeywords?: string[];
  feeds: string[];
  responseStyle: string;
  reasoning: string;
}

export interface OpportunitySuggestion {
  shouldReply: boolean;
  confidence: number;
  reason: string;
  draft: string;
}

export interface AiMatchReview {
  isOpportunity: boolean;
  opportunityType: LeadIntent | "not_relevant";
  matchScore: number;
  matchStrength: MatchStrength;
  shouldReply: boolean;
  risk: AiRisk;
  reason: string;
}
