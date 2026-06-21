import { useState } from "react";
import { formatListForTextarea, loadSettings, parseFeedList, parseKeywordList } from "../lib/storage";
import type { Project } from "../types/project";

type ProjectFormProps = {
  onAdd: (project: Project) => void;
};

const DEFAULT_FEEDS = [
  "https://www.reddit.com/r/webdev/new.rss",
  "https://www.reddit.com/r/smallbusiness/new.rss",
  "https://www.reddit.com/r/SEO/new.rss",
].join("\n");

export function ProjectForm({ onAdd }: ProjectFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [keywords, setKeywords] = useState("");
  const [avoidKeywords, setAvoidKeywords] = useState("");
  const [feeds, setFeeds] = useState(DEFAULT_FEEDS);
  const [responseStyle, setResponseStyle] = useState("Helpful, transparent, and not salesy.");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [aiError, setAiError] = useState("");

  const generateSetup = async () => {
    const settings = loadSettings();
    setAiMessage("");
    setAiError("");

    if (!settings.openAiKey) {
      setAiError("Add your OpenAI API key in Settings first.");
      return;
    }

    if (!name.trim() && !description.trim()) {
      setAiError("Add at least a project name or description first.");
      return;
    }

    setIsGenerating(true);
    try {
      const result = await window.signalScout?.openAiSuggestProject({
        apiKey: settings.openAiKey,
        model: settings.openAiModel,
        name,
        description,
        targetAudience,
        websiteUrl,
      });

      if (!result?.ok || !result.suggestion) {
        setAiError(result?.error || "OpenAI could not generate project suggestions.");
        return;
      }

      const enriched = enrichProjectSuggestion(result.suggestion, { name, description, targetAudience, websiteUrl });
      setKeywords(formatListForTextarea(enriched.keywords));
      setAvoidKeywords(formatListForTextarea(enriched.avoidKeywords));
      setFeeds(formatListForTextarea(enriched.feeds));
      setResponseStyle(enriched.responseStyle);
      setAiMessage(
        enriched.reasoning
          || `Project setup generated with ${enriched.keywords.length} search terms and ${enriched.feeds.length} feeds. Review and edit before saving.`,
      );
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "OpenAI could not generate project suggestions.");
    } finally {
      setIsGenerating(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;

    onAdd({
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      keywords: parseKeywordList(keywords),
      avoidKeywords: parseKeywordList(avoidKeywords),
      feeds: parseFeedList(feeds),
      responseStyle: responseStyle.trim(),
      createdAt: new Date().toISOString(),
    });

    setName("");
    setDescription("");
    setTargetAudience("");
    setWebsiteUrl("");
    setKeywords("");
    setAvoidKeywords("");
    setFeeds(DEFAULT_FEEDS);
    setResponseStyle("Helpful, transparent, and not salesy.");
    setAiMessage("");
    setAiError("");
  };

  return (
    <form className="panel form-grid" onSubmit={submit}>
      <div className="settings-section-header">
        <div className="section-heading compact">
          <p className="eyebrow">New project</p>
          <h2>Add a radar profile</h2>
        </div>
        <button className="ghost ai-button" type="button" onClick={generateSetup} disabled={isGenerating}>
          {isGenerating ? "Generating…" : "Generate setup with AI"}
        </button>
      </div>

      {aiMessage && <div className="alert success-alert">{aiMessage}</div>}
      {aiError && <div className="alert error-alert">{aiError}</div>}

      <label>
        Project name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="My Project" />
      </label>

      <label>
        Description
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What this project does and who it helps." />
      </label>

      <div className="two-column-grid">
        <label>
          Target audience <span className="optional-label">optional</span>
          <input value={targetAudience} onChange={(event) => setTargetAudience(event.target.value)} placeholder="SVG users, AI trainers, small businesses" />
        </label>

        <label>
          Website/Product URL <span className="optional-label">optional</span>
          <input value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://freeprotool.com" />
        </label>
      </div>

      <label>
        Focus keywords
        <textarea value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="svg, xlsx viewer, ocr errors" />
        <small>Comma or line separated. These are used to score each feed item.</small>
      </label>

      <label>
        RSS feeds to scan
        <textarea value={feeds} onChange={(event) => setFeeds(event.target.value)} placeholder="https://www.reddit.com/r/webdev/new.rss" />
        <small>
          One RSS feed per line or comma separated. Reddit subreddit names like <strong>webdev</strong> are automatically converted to /new.rss feeds.
        </small>
      </label>

      <label>
        Avoid keywords
        <textarea value={avoidKeywords} onChange={(event) => setAvoidKeywords(event.target.value)} placeholder="job, internship, homework" />
        <small>Matches containing these terms score lower.</small>
      </label>

      <label>
        Response style
        <textarea value={responseStyle} onChange={(event) => setResponseStyle(event.target.value)} />
      </label>

      <button className="primary-button" type="submit">Add project</button>
    </form>
  );
}


type ProjectSuggestionContext = {
  name: string;
  description: string;
  targetAudience: string;
  websiteUrl: string;
};

type RawProjectSuggestion = {
  keywords: string[];
  avoidKeywords: string[];
  feeds: string[];
  responseStyle: string;
  reasoning: string;
};

const BROAD_DISCOVERY_SUBREDDITS = [
  "webdev",
  "Frontend",
  "reactjs",
  "nextjs",
  "javascript",
  "typescript",
  "programming",
  "learnprogramming",
  "codinghelp",
  "AskProgramming",
  "softwaredevelopment",
  "SaaS",
  "startups",
  "Entrepreneur",
  "smallbusiness",
  "SEO",
  "marketing",
  "digital_marketing",
  "content_marketing",
  "freelance",
  "Design",
  "graphic_design",
  "web_design",
  "UserExperienceDesign",
  "UI_Design",
  "productivity",
  "tools",
  "DataHoarder",
  "datasets",
  "dataengineering",
  "datascience",
  "MachineLearning",
  "LocalLLaMA",
  "ChatGPTCoding",
  "OpenAI",
  "ArtificialInteligence",
  "QualityAssurance",
  "softwaretesting",
  "devops",
  "sysadmin",
  "APIs",
  "learnjavascript",
  "AskTechnology",
  "NoCode",
  "sideproject",
  "indiehackers",
];

const TOOL_DISCOVERY_SUBREDDITS: Record<string, string[]> = {
  svg: ["svg", "Inkscape", "AdobeIllustrator", "cricut", "lasercutting", "graphic_design", "web_design"],
  json: ["javascript", "typescript", "webdev", "api", "APIs", "learnprogramming", "softwaretesting", "devops"],
  csv: ["excel", "spreadsheets", "dataengineering", "datascience", "datasets", "python", "analytics"],
  xml: ["webdev", "programming", "sysadmin", "devops", "softwaretesting", "rss", "androiddev"],
  yaml: ["devops", "kubernetes", "docker", "selfhosted", "homelab", "sysadmin", "ansible"],
  ocr: ["OCR", "DataHoarder", "Archivists", "Genealogy", "AskTechnology", "productivity", "datasets"],
  pii: ["cybersecurity", "privacy", "dataengineering", "compliance", "softwaretesting", "datascience"],
  api: ["APIs", "webdev", "softwaretesting", "devops", "Frontend", "reactjs", "nextjs"],
  website: ["webdev", "web_design", "SEO", "smallbusiness", "Entrepreneur", "SaaS", "marketing"],
};

const BROAD_SEARCH_PATTERNS = [
  "tool",
  "free tool",
  "online tool",
  "browser tool",
  "no signup",
  "without uploading",
  "client side",
  "formatter",
  "validator",
  "viewer",
  "converter",
  "generator",
  "cleanup",
  "clean up",
  "corruptor",
  "test data",
  "sample data",
  "debug",
  "parse",
  "export",
  "download",
  "copy paste",
  "drag and drop",
  "bulk",
  "batch",
  "alternative",
  "recommendation",
  "best way",
  "how do i",
  "is there a way",
  "looking for",
  "need help with",
  "problem with",
  "broken",
  "error",
  "issue",
  "workflow",
  "automation",
  "qa testing",
  "frontend testing",
  "api testing",
];

const COMMON_AVOID_TERMS = [
  "job",
  "hiring",
  "internship",
  "resume",
  "homework",
  "assignment",
  "school project",
  "torrent",
  "piracy",
  "crack",
  "coupon",
  "crypto",
  "politics",
  "meme",
  "giveaway",
  "nsfw",
];

function enrichProjectSuggestion(suggestion: RawProjectSuggestion, context: ProjectSuggestionContext): RawProjectSuggestion {
  const contextText = [context.name, context.description, context.targetAudience, context.websiteUrl].join(" ").toLowerCase();
  const baseKeywords = uniqueCleanList(suggestion.keywords);
  const seedTerms = extractSeedTerms(contextText, baseKeywords);
  const keywordPool = buildKeywordPool(baseKeywords, seedTerms);
  const feedPool = buildFeedPool(suggestion.feeds, contextText, seedTerms);
  const avoidPool = uniqueCleanList([...suggestion.avoidKeywords, ...COMMON_AVOID_TERMS]);

  return {
    keywords: keywordPool.slice(0, 80),
    avoidKeywords: avoidPool.slice(0, 30),
    feeds: feedPool.slice(0, 60),
    responseStyle: suggestion.responseStyle || "Helpful, transparent, and not salesy.",
    reasoning: suggestion.reasoning
      ? `${suggestion.reasoning} Expanded locally for wider discovery: ${Math.min(keywordPool.length, 80)} search terms and ${Math.min(feedPool.length, 60)} feeds.`
      : `Expanded locally for wider discovery: ${Math.min(keywordPool.length, 80)} search terms and ${Math.min(feedPool.length, 60)} feeds.`,
  };
}

function buildKeywordPool(baseKeywords: string[], seedTerms: string[]) {
  const generated: string[] = [];
  for (const term of seedTerms) {
    generated.push(term);
    for (const pattern of BROAD_SEARCH_PATTERNS) {
      generated.push(`${term} ${pattern}`);
    }
  }

  return uniqueCleanList([
    ...baseKeywords,
    ...generated,
    ...BROAD_SEARCH_PATTERNS,
  ]);
}

function buildFeedPool(existingFeeds: string[], contextText: string, seedTerms: string[]) {
  const subreddits = new Set<string>(BROAD_DISCOVERY_SUBREDDITS);

  for (const [needle, additions] of Object.entries(TOOL_DISCOVERY_SUBREDDITS)) {
    if (contextText.includes(needle) || seedTerms.some((term) => term.includes(needle))) {
      additions.forEach((subreddit) => subreddits.add(subreddit));
    }
  }

  return uniqueCleanList([
    ...existingFeeds,
    ...Array.from(subreddits).map((subreddit) => `https://www.reddit.com/r/${subreddit}/new.rss`),
  ]);
}

function extractSeedTerms(contextText: string, baseKeywords: string[]) {
  const fromContext = contextText
    .replace(/https?:\/\/\S+/g, " ")
    .split(/[^a-z0-9+#.-]+/gi)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length >= 3)
    .filter((word) => !COMMON_CONTEXT_STOP_WORDS.has(word));

  const fromKeywords = baseKeywords
    .flatMap((keyword) => [keyword, ...keyword.split(/\s+/g)])
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length >= 2)
    .filter((word) => !COMMON_CONTEXT_STOP_WORDS.has(word));

  return uniqueCleanList([...fromKeywords, ...fromContext]).slice(0, 12);
}

function uniqueCleanList(values: string[]) {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const value of values) {
    const item = String(value || "").trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(item);
  }

  return cleaned;
}

const COMMON_CONTEXT_STOP_WORDS = new Set([
  "and",
  "are",
  "but",
  "for",
  "from",
  "how",
  "into",
  "not",
  "our",
  "the",
  "that",
  "this",
  "with",
  "you",
  "your",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "free",
  "tool",
  "tools",
  "online",
  "website",
  "product",
  "project",
]);
