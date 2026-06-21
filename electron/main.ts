import { app, BrowserWindow, ipcMain, shell } from "electron";
import Parser from "rss-parser";
import { release } from "node:os";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const appRoot = join(__dirname, "..");
const rendererDist = join(appRoot, "dist");

process.env.DIST_ELECTRON = __dirname;
process.env.DIST = rendererDist;
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? join(appRoot, "public")
  : rendererDist;

if (release().startsWith("6.1")) app.disableHardwareAcceleration();
if (process.platform === "win32") app.setAppUserModelId(app.getName());

let win: BrowserWindow | null = null;

function createWindow() {
  const indexHtml = join(rendererDist, "index.html");
  logPathDebug(indexHtml);

  win = new BrowserWindow({
    title: "Signal Scout",
    width: 1200,
    height: 820,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: join(__dirname, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(indexHtml);
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function logPathDebug(indexHtml: string) {
  if (app.isPackaged && process.env.SIGNAL_SCOUT_DEBUG_PATHS !== "1") return;

  console.log("[Signal Scout] app.isPackaged:", app.isPackaged);
  console.log("[Signal Scout] __dirname:", __dirname);
  console.log("[Signal Scout] process.resourcesPath:", process.resourcesPath);
  console.log("[Signal Scout] resolved index.html:", indexHtml);
  console.log("[Signal Scout] index.html exists:", existsSync(indexHtml));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  win = null;
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("shell:openExternal", async (_event, url: string) => {
  await shell.openExternal(url);
});

type NormalizedFeedItem = {
  id: string;
  title: string;
  description: string;
  content: string;
  feedTitle: string;
  feedUrl: string;
  author: string;
  link: string;
  pubDate: string;
};

const parser = new Parser({
  timeout: 18_000,
  headers: {
    "User-Agent": "SignalScout/0.1 RSS Opportunity Monitor",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
  },
});

ipcMain.handle("rss:scan", async (_event, args: { feeds?: string[]; limitPerFeed?: number }) => {
  try {
    const feeds = Array.isArray(args.feeds)
      ? args.feeds.map((feed) => String(feed || "").trim()).filter(Boolean).slice(0, 60)
      : [];
    console.log("[Signal Scout] rss:scan payload", { feeds, limitPerFeed: args.limitPerFeed });

    if (feeds.length === 0) {
      console.error("[Signal Scout] rss:scan error", "No RSS feeds configured for this project.");
      return { ok: false, error: "No RSS feeds configured for this project." };
    }

    const limitPerFeed = Math.max(1, Math.min(Number(args.limitPerFeed || 50), 150));
    const items: NormalizedFeedItem[] = [];
    const errors: string[] = [];

    for (const feedUrl of feeds) {
      await wait(250);

      try {
        const feed = await parser.parseURL(feedUrl);
        const feedTitle = feed.title || shortFeedName(feedUrl);

        for (const item of (feed.items || []).slice(0, limitPerFeed)) {
          const link = String(item.link || item.guid || "").trim();
          if (!link) continue;

          items.push({
            id: String(item.guid || link),
            title: String(item.title || "Untitled feed item"),
            description: String(item.contentSnippet || item.summary || ""),
            content: String(item.content || item.summary || item.contentSnippet || ""),
            feedTitle,
            feedUrl,
            author: String(item.creator || item.author || "unknown"),
            link,
            pubDate: String(item.isoDate || item.pubDate || ""),
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown feed error";
        errors.push(`${shortFeedName(feedUrl)}: ${message}`);
        console.error("[Signal Scout] rss:scan feed error", { feedUrl, message });
      }
    }

    const deduped = dedupeItems(items);
    console.log("[Signal Scout] rss:scan raw results count", { count: deduped.length, errors });
    return { ok: true, items: deduped, errors };
  } catch (error) {
    console.error("[Signal Scout] rss:scan handler error", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown RSS scan failure.",
    };
  }
});

ipcMain.handle("openai:test", async (_event, args: { apiKey?: string; model?: string }) => {
  try {
    const content = await callOpenAiJson(args.apiKey, args.model, [
      { role: "system", content: "Return JSON only." },
      { role: "user", content: "Return {\"ok\":true,\"message\":\"OpenAI connection works.\"}" },
    ]);

    return { ok: true, message: String(content.message || "OpenAI connection works.") };
  } catch (error) {
    return { ok: false, error: formatOpenAiError(error) };
  }
});

ipcMain.handle("openai:suggestProject", async (_event, args: {
  apiKey?: string;
  model?: string;
  name?: string;
  description?: string;
  targetAudience?: string;
  websiteUrl?: string;
}) => {
  try {
    const prompt = `Create a Signal Scout project setup for monitoring RSS/community feeds using ONLY this user's project/business/domain.\n\nProject name: ${args.name || "Untitled"}\nDescription: ${args.description || ""}\nTarget audience: ${args.targetAudience || ""}\nWebsite/product URL: ${args.websiteUrl || ""}\n\nGenerate suggestions only for this user's project/business/domain. Do not assume this app is for software developers, web tools, QA, APIs, SVGs, data tools, or AI training unless the user's project explicitly says so.\n\nReturn strict JSON with these keys:\n- keywords: 80 to 150 search keywords/phrases, lowercase. Include core nouns, plural/singular variants, product terms, customer problem phrases, buying/recommendation phrases, beginner questions, and niche/community language.\n- feeds: 40 to 80 subreddit RSS URLs. Prefer real Reddit /new.rss feeds relevant to the user's project/domain, e.g. https://www.reddit.com/r/example/new.rss.\n- responseStyle: one short sentence describing how replies should sound.\n- reasoning: 2 short sentences explaining why these terms and communities fit this project.\n\nDo not suggest avoidKeywords. Leave avoid words blank for the user to add manually. Do not include markdown.`;

    const suggestion = await callOpenAiJson(args.apiKey, args.model, [
      {
        role: "system",
        content: "You help configure ethical community monitoring projects. You never automate posting. Return compact valid JSON only.",
      },
      { role: "user", content: prompt },
    ]);

    return {
      ok: true,
      suggestion: {
        keywords: sanitizeStringArray(suggestion.keywords).slice(0, 150),
        avoidKeywords: [],
        feeds: sanitizeStringArray(suggestion.feeds).filter((feed) => /^https?:\/\//i.test(feed)).slice(0, 80),
        responseStyle: typeof suggestion.responseStyle === "string" && suggestion.responseStyle.trim()
          ? suggestion.responseStyle.trim()
          : "Helpful, transparent, and not salesy.",
        reasoning: typeof suggestion.reasoning === "string" ? suggestion.reasoning.trim() : "Generated from the project details.",
      },
    };
  } catch (error) {
    return { ok: false, error: formatOpenAiError(error) };
  }
});

ipcMain.handle("openai:draftOpportunity", async (_event, args: {
  apiKey?: string;
  model?: string;
  project?: {
    name?: string;
    description?: string;
    goal?: string;
    targetAudience?: string;
    keywords?: string[];
    avoidKeywords?: string[];
    responseStyle?: string;
  };
  opportunity?: {
    title?: string;
    summary?: string;
    url?: string;
    matchedKeywords?: string[];
    source?: string;
    subreddit?: string;
    score?: number;
    intent?: string;
    matchExplanation?: string[];
  };
}) => {
  try {
    const prompt = `Review this lead and draft a reply only if replying is genuinely useful.\n\nProject context:\n${JSON.stringify(args.project || {}, null, 2)}\n\nLead/Post context:\n${JSON.stringify(args.opportunity || {}, null, 2)}\n\nRules:\n- Write a response specific to the post.\n- Do not sound like an ad.\n- Do not say "I found this because it matched keywords."\n- Do not say "I built something around this problem" unless the project description clearly supports that.\n- If replying would feel forced or spammy, return shouldReply=false.\n- Keep the draft natural, useful, and human.\n- Mention the project/tool only if it is genuinely relevant.\n- Prefer helpful advice first, link/tool mention second.\n- Never imply affiliation with Reddit or the original poster.\n\nReturn strict JSON exactly like:\n{"shouldReply":true,"confidence":82,"reason":"short reason","draft":"reply draft"}\n\nIf shouldReply is false, draft may be an empty string. Do not include markdown.`;

    // Cost-control: response generation is only called from the user's Generate Response click.
    // Signal Scout never drafts replies during initial render or routine RSS scanning.
    const suggestion = await callOpenAiJson(args.apiKey, args.model, [
      {
        role: "system",
        content: "You write ethical, specific community reply recommendations. You reject spammy opportunities. Return valid JSON only.",
      },
      { role: "user", content: prompt },
    ]);

    return {
      ok: true,
      suggestion: normalizeDraftSuggestion(suggestion),
    };
  } catch (error) {
    return { ok: false, error: formatOpenAiError(error) };
  }
});

ipcMain.handle("openai:reviewOpportunity", async (_event, args: {
  apiKey?: string;
  model?: string;
  project?: {
    name?: string;
    description?: string;
    keywords?: string[];
    avoidKeywords?: string[];
    responseStyle?: string;
  };
  opportunity?: {
    title?: string;
    summary?: string;
    source?: string;
    url?: string;
    matchedKeywords?: string[];
    score?: number;
    intent?: string;
    matchExplanation?: string[];
  };
}) => {
  try {
    const prompt = `Review whether this locally-scored RSS item is a real outreach opportunity.\n\nProject:\n${JSON.stringify(args.project || {}, null, 2)}\n\nPost:\n${JSON.stringify(args.opportunity || {}, null, 2)}\n\nReturn strict JSON exactly like:\n{"isOpportunity":true,"opportunityType":"support_question","matchScore":85,"matchStrength":"high","shouldReply":true,"risk":"low","reason":"short reason"}\n\nopportunityType must be one of support_question, recommendation_request, tool_request, buying_intent, discussion, not_relevant.\nmatchStrength must be exactly one of low, medium, high.\nmatchScore should be a number from 0 to 100.\nrisk must be low, medium, or high. Do not include markdown.`;

    // Cost-control: this handler is only reached after local keyword and intent scoring passes
    // the user's opt-in threshold and per-scan cap. It is not used for every feed item.
    const review = await callOpenAiJson(args.apiKey, args.model, [
      {
        role: "system",
        content: "You are a conservative lead-quality reviewer. Prefer not_relevant when the match is weak or reply risk is high. Return valid JSON only.",
      },
      { role: "user", content: prompt },
    ]);

    return {
      ok: true,
      review: normalizeMatchReview(review),
    };
  } catch (error) {
    return { ok: false, error: formatOpenAiError(error) };
  }
});

async function callOpenAiJson(apiKey: string | undefined, model: string | undefined, messages: Array<{ role: string; content: string }>) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("Missing OpenAI API key.");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: String(model || "gpt-4o-mini").trim() || "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI returned ${response.status}: ${trimForError(text)}`);
  }

  try {
    const data = JSON.parse(text);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("OpenAI returned an empty response.");
    return JSON.parse(content);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Could not parse OpenAI JSON response.");
  }
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index);
}

function normalizeDraftSuggestion(value: any) {
  return {
    shouldReply: Boolean(value?.shouldReply),
    confidence: clampNumber(value?.confidence, 0, 100, 0),
    reason: typeof value?.reason === "string" ? value.reason.trim() : "No reason provided.",
    draft: typeof value?.draft === "string" ? value.draft.trim() : "",
  };
}

function normalizeMatchReview(value: any) {
  const opportunityType = [
    "support_question",
    "recommendation_request",
    "tool_request",
    "buying_intent",
    "discussion",
    "not_relevant",
  ].includes(value?.opportunityType)
    ? value.opportunityType
    : "not_relevant";
  const risk = ["low", "medium", "high"].includes(value?.risk) ? value.risk : "medium";

  return {
    isOpportunity: Boolean(value?.isOpportunity),
    opportunityType,
    matchScore: clampNumber(value?.matchScore ?? value?.matchStrength, 0, 100, 0),
    matchStrength: normalizeMatchStrength(value?.matchStrength, value?.matchScore),
    shouldReply: Boolean(value?.shouldReply),
    risk,
    reason: typeof value?.reason === "string" ? value.reason.trim() : "No reason provided.",
  };
}

function normalizeMatchStrength(value: unknown, score: unknown) {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["high", "strong", "great", "perfect", "very relevant"].includes(normalized)) return "high";
    if (["medium", "maybe", "possible", "decent", "relevant"].includes(normalized)) return "medium";
    if (["low", "weak", "poor", "stretch", "not relevant"].includes(normalized)) return "low";
  }

  const numeric = clampNumber(score ?? value, 0, 100, 0);
  if (numeric >= 75) return "high";
  if (numeric >= 45) return "medium";
  return "low";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function formatOpenAiError(error: unknown) {
  return error instanceof Error ? error.message : "OpenAI request failed.";
}

function trimForError(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 400 ? `${compact.slice(0, 397)}...` : compact;
}

function dedupeItems(items: NormalizedFeedItem[]) {
  const seen = new Set<string>();
  const result: NormalizedFeedItem[] = [];

  for (const item of items) {
    const key = item.link || item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function shortFeedName(feedUrl: string) {
  const reddit = feedUrl.match(/reddit\.com\/r\/([^/]+)/i);
  if (reddit) return `r/${reddit[1]}`;

  try {
    return new URL(feedUrl).hostname.replace(/^www\./, "");
  } catch {
    return feedUrl;
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
