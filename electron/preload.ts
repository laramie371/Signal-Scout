import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

type Listener = (data: unknown) => void;
const listenerMap = new Map<Listener, { channel: string; listener: (event: IpcRendererEvent, data: unknown) => void }>();

function on(channel: string, callback: Listener) {
  const listener = (_event: IpcRendererEvent, data: unknown) => callback(data);
  listenerMap.set(callback, { channel, listener });
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

function off(channel: string, callback: Listener) {
  const entry = listenerMap.get(callback);
  if (!entry || entry.channel !== channel) return;
  ipcRenderer.removeListener(channel, entry.listener);
  listenerMap.delete(callback);
}

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
      reviewId?: string;
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
  on,
  off,
});

contextBridge.exposeInMainWorld("electronAPI", {
  scan: (payload: unknown) => ipcRenderer.invoke("rss:scan", payload),
  rssScan: (args: { feeds: string[]; limitPerFeed?: number }) => ipcRenderer.invoke("rss:scan", args),
  on,
  off,
});
