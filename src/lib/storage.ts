import type { AppSettings, Opportunity, Project } from "../types/project";

const PROJECTS_KEY = "signal-scout-projects";
const SETTINGS_KEY = "signal-scout-settings";
const OPENAI_KEY = "signal-scout-openai-key";
const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";
const LEADS_KEY = "signal-scout-leads";

export const DEFAULT_SETTINGS: AppSettings = {
  openAiKey: "",
  openAiModel: DEFAULT_OPENAI_MODEL,
  minimumOpportunityScore: 50,
  postsPerFeed: 50,
  maxFeedAgeDays: 30,
  autoMarkReadSeconds: 2,
  hideDismissed: true,
  hideResponded: true,
  enableAiMatchReview: false,
  aiReviewThreshold: 70,
  maxAiReviewsPerScan: 5,
  aiReviewMode: "top_n",
  keywordMatchMode: "high_recall",
};

export type BackupData = {
  projects: Project[];
  leads: Opportunity[];
  settings: AppSettings;
};

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((project) => ({
      ...project,
      feeds: normalizeLegacyFeeds(project),
      keywords: Array.isArray(project.keywords) ? project.keywords : [],
      avoidKeywords: Array.isArray(project.avoidKeywords) ? project.avoidKeywords : [],
      responseStyle: typeof project.responseStyle === "string" ? project.responseStyle : "Helpful, transparent, and not salesy.",
      createdAt: typeof project.createdAt === "string" ? project.createdAt : new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

export function saveProjects(projects: Project[]) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return normalizeSettings(parsed);
    }
  } catch {
    // Fall through to legacy key/default.
  }

  return normalizeSettings(undefined);
}

export function saveSettings(settings: AppSettings) {
  const normalized = normalizeSettings(settings);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  saveOpenAiKey(normalized.openAiKey);
}

export function loadOpenAiKey(): string {
  const settingsRaw = localStorage.getItem(SETTINGS_KEY);
  if (settingsRaw) {
    try {
      const parsed = JSON.parse(settingsRaw);
      if (typeof parsed?.openAiKey === "string") return parsed.openAiKey;
    } catch {
      // ignore
    }
  }

  return localStorage.getItem(OPENAI_KEY) || "";
}

export function saveOpenAiKey(key: string) {
  if (key.trim()) {
    localStorage.setItem(OPENAI_KEY, key.trim());
  } else {
    localStorage.removeItem(OPENAI_KEY);
  }
}

function normalizeSettings(value: Partial<AppSettings> | undefined | null): AppSettings {
  return {
    openAiKey: typeof value?.openAiKey === "string" ? value.openAiKey.trim() : loadOpenAiKey(),
    minimumOpportunityScore: numberOrDefault(value?.minimumOpportunityScore, DEFAULT_SETTINGS.minimumOpportunityScore, 0, 99),
    postsPerFeed: numberOrDefault(value?.postsPerFeed, DEFAULT_SETTINGS.postsPerFeed, 1, 150),
    maxFeedAgeDays: numberOrDefault(value?.maxFeedAgeDays, DEFAULT_SETTINGS.maxFeedAgeDays, 1, 365),
    autoMarkReadSeconds: numberOrDefault(value?.autoMarkReadSeconds, DEFAULT_SETTINGS.autoMarkReadSeconds, 0, 60),
    hideDismissed: value?.hideDismissed ?? DEFAULT_SETTINGS.hideDismissed,
    hideResponded: value?.hideResponded ?? DEFAULT_SETTINGS.hideResponded,
    enableAiMatchReview: value?.enableAiMatchReview ?? DEFAULT_SETTINGS.enableAiMatchReview,
    aiReviewThreshold: numberOrDefault(value?.aiReviewThreshold, DEFAULT_SETTINGS.aiReviewThreshold, 0, 100),
    maxAiReviewsPerScan: numberOrDefault(value?.maxAiReviewsPerScan, DEFAULT_SETTINGS.maxAiReviewsPerScan, 0, 100),
    aiReviewMode: value?.aiReviewMode === "all" ? "all" : DEFAULT_SETTINGS.aiReviewMode,
    keywordMatchMode: value?.keywordMatchMode === "exact_phrase" ? "exact_phrase" : DEFAULT_SETTINGS.keywordMatchMode,
    openAiModel: typeof value?.openAiModel === "string" && value.openAiModel.trim()
      ? value.openAiModel.trim()
      : DEFAULT_OPENAI_MODEL,
  };
}

function numberOrDefault(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function normalizeLegacyFeeds(project: any): string[] {
  if (Array.isArray(project.feeds)) {
    return sanitizeFeedList(project.feeds);
  }

  if (Array.isArray(project.subreddits)) {
    return sanitizeFeedList(project.subreddits.map((subreddit: string) => redditNewFeed(subreddit)));
  }

  return [];
}

export function redditNewFeed(value: string) {
  const subreddit = String(value || "").trim().replace(/^r\//i, "").replace(/^\//, "").toLowerCase();
  return subreddit ? `https://www.reddit.com/r/${subreddit}/new.rss` : "";
}

function sanitizeFeedList(feeds: string[]): string[] {
  return feeds
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const clean = item.replace(/^r\//i, "").replace(/^\//, "").trim();
      if (/^[a-z0-9_]{2,21}$/i.test(clean)) return redditNewFeed(clean);
      return item;
    })
    .filter((item) => /^https?:\/\//i.test(item))
    .filter((item, index, all) => all.indexOf(item) === index);
}

export function parseKeywordList(value: string): string[] {
  return value
    .split(/[\n,]/g)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index);
}

export function parseFeedList(value: string): string[] {
  return sanitizeFeedList(value.split(/[\n,]/g));
}

export function formatListForTextarea(value: string[]) {
  return value.join("\n");
}

export function loadLeads(): Opportunity[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEADS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((lead) => typeof lead?.id === "string" && typeof lead?.projectId === "string");
  } catch {
    return [];
  }
}

export function saveLeads(leads: Opportunity[]) {
  localStorage.setItem(LEADS_KEY, JSON.stringify(leads));
}

export function buildBackup(): BackupData {
  return {
    projects: loadProjects(),
    leads: loadLeads(),
    settings: loadSettings(),
  };
}

export function parseBackup(value: unknown): BackupData | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<BackupData>;
  if (!Array.isArray(candidate.projects) || !Array.isArray(candidate.leads) || !candidate.settings) return null;
  if (!candidate.projects.every(isProjectLike) || !candidate.leads.every(isOpportunityLike)) return null;

  return {
    projects: candidate.projects,
    leads: candidate.leads,
    settings: normalizeSettings(candidate.settings),
  };
}

export function restoreBackup(backup: BackupData) {
  saveProjects(backup.projects);
  saveLeads(backup.leads);
  saveSettings(backup.settings);
}

function isProjectLike(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<Project>;
  return typeof project.id === "string"
    && typeof project.name === "string"
    && typeof project.description === "string"
    && Array.isArray(project.keywords)
    && Array.isArray(project.avoidKeywords)
    && Array.isArray(project.feeds)
    && typeof project.responseStyle === "string"
    && typeof project.createdAt === "string";
}

function isOpportunityLike(value: unknown): value is Opportunity {
  if (!value || typeof value !== "object") return false;
  const opportunity = value as Partial<Opportunity>;
  return typeof opportunity.id === "string"
    && typeof opportunity.projectId === "string"
    && typeof opportunity.title === "string"
    && typeof opportunity.url === "string"
    && typeof opportunity.score === "number"
    && isLeadStatus(opportunity.status)
    && Array.isArray(opportunity.matchedKeywords)
    && Array.isArray(opportunity.avoidedKeywords)
    && typeof opportunity.foundAt === "string";
}

function isLeadStatus(value: unknown): value is Opportunity["status"] {
  return value === "new" || value === "saved" || value === "dismissed" || value === "responded";
}
