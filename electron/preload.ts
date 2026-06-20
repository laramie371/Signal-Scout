import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("signalScout", {
  rssScan: (args: { feeds: string[]; limitPerFeed?: number }) => ipcRenderer.invoke("rss:scan", args),
  openAiTest: (args: { apiKey: string; model?: string }) => ipcRenderer.invoke("openai:test", args),
  openAiSuggestProject: (args: {
    apiKey: string;
    model?: string;
    name: string;
    description: string;
    targetAudience?: string;
    websiteUrl?: string;
  }) => ipcRenderer.invoke("openai:suggestProject", args),
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
    opportunity: {
      title: string;
      summary: string;
      url: string;
      matchedKeywords: string[];
      source: string;
      subreddit?: string;
      score: number;
      intent?: string;
      matchExplanation?: string[];
    };
  }) => ipcRenderer.invoke("openai:draftOpportunity", args),
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
  }) => ipcRenderer.invoke("openai:reviewOpportunity", args),
  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),
});
