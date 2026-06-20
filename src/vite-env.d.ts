/// <reference types="vite/client" />

import type { FeedItem } from "./lib/rss";
import type { AiMatchReview, Opportunity, OpportunitySuggestion, ProjectSetupSuggestion } from "./types/project";

export {};

declare global {
  interface Window {
    signalScout?: {
      rssScan: (args: { feeds: string[]; limitPerFeed?: number }) => Promise<{
        ok: boolean;
        items?: FeedItem[];
        errors?: string[];
        error?: string;
      }>;
      openAiTest: (args: { apiKey: string; model?: string }) => Promise<{
        ok: boolean;
        message?: string;
        error?: string;
      }>;
      openAiSuggestProject: (args: {
        apiKey: string;
        model?: string;
        name: string;
        description: string;
        targetAudience?: string;
        websiteUrl?: string;
      }) => Promise<{
        ok: boolean;
        suggestion?: ProjectSetupSuggestion;
        error?: string;
      }>;
      openAiDraftOpportunity: (args: {
        apiKey: string;
        model?: string;
        project: {
          name: string;
          description: string;
          goal?: string;
          targetAudience?: string;
          keywords: string[];
          avoidKeywords: string[];
          responseStyle: string;
        };
        opportunity: Pick<Opportunity, "title" | "summary" | "url" | "matchedKeywords" | "score"> & {
          source: string;
          subreddit?: string;
          intent?: string;
          matchExplanation?: string[];
        };
      }) => Promise<{
        ok: boolean;
        suggestion?: OpportunitySuggestion;
        error?: string;
      }>;
      openAiReviewOpportunity: (args: {
        apiKey: string;
        model?: string;
        project: {
          name: string;
          description: string;
          keywords: string[];
          avoidKeywords: string[];
          responseStyle: string;
        };
        opportunity: {
          title: string;
          summary: string;
          source: string;
          url: string;
          matchedKeywords: string[];
          score: number;
          intent: string;
          matchExplanation: string[];
        };
      }) => Promise<{
        ok: boolean;
        review?: AiMatchReview;
        error?: string;
      }>;
      openExternal: (url: string) => Promise<void>;
    };
  }
}
