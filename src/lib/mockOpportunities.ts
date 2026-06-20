import type { Opportunity } from "../types/project";

export const mockOpportunities: Opportunity[] = [
  {
    id: "mock-1",
    projectId: "mock-project",
    title: "Example RSS match",
    source: "RSS",
    subreddit: "example.com",
    url: "https://example.com/",
    score: 86,
    matchedKeywords: ["example"],
    avoidedKeywords: [],
    summary: "This placeholder shows how a matched RSS item will look once a scan finds relevant posts.",
    status: "new",
    foundAt: new Date().toISOString(),
    intent: "not_clear",
    intentScore: 0,
    matchExplanation: ["Keyword \"example\" matched in title (+30)"],
  },
];
