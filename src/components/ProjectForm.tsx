import { useState } from "react";
import { formatListForTextarea, loadSettings, parseFeedList, parseKeywordList } from "../lib/storage";
import type { Project } from "../types/project";

type ProjectFormProps = {
  onAdd: (project: Project) => void;
};

const DEFAULT_FEEDS = "";

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
          <input value={targetAudience} onChange={(event) => setTargetAudience(event.target.value)} placeholder="Homeowners, hobbyists, parents, small businesses" />
        </label>

        <label>
          Website/Product URL <span className="optional-label">optional</span>
          <input value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://example.com" />
        </label>
      </div>

      <label>
        Focus keywords
        <textarea value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="cleaning kit, puppy grooming, patio repair" />
        <small>Comma or line separated. These are used to score each feed item.</small>
      </label>

      <label>
        RSS feeds to scan
        <textarea value={feeds} onChange={(event) => setFeeds(event.target.value)} placeholder="https://www.reddit.com/r/gardening/new.rss" />
        <small>
          One RSS feed per line or comma separated. Reddit subreddit names like <strong>gardening</strong> are automatically converted to /new.rss feeds.
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
  avoidKeywords?: string[];
  feeds: string[];
  responseStyle: string;
  reasoning: string;
};

function enrichProjectSuggestion(suggestion: RawProjectSuggestion, context: ProjectSuggestionContext): RawProjectSuggestion {
  const contextText = [context.name, context.description, context.targetAudience, context.websiteUrl].join(" ").toLowerCase();
  const baseKeywords = uniqueCleanList(suggestion.keywords);
  const seedTerms = extractSeedTerms(contextText, baseKeywords);
  const keywordPool = buildKeywordPool(baseKeywords, seedTerms);
  const feedPool = uniqueCleanList(suggestion.feeds).filter((feed) => /^https?:\/\//i.test(feed));

  return {
    keywords: keywordPool.slice(0, 150),
    avoidKeywords: [],
    feeds: feedPool.slice(0, 80),
    responseStyle: suggestion.responseStyle || "Helpful, transparent, and not salesy.",
    reasoning: suggestion.reasoning
      ? `${suggestion.reasoning} Expanded locally from this project only: ${Math.min(keywordPool.length, 150)} search terms and ${Math.min(feedPool.length, 80)} feeds.`
      : `Expanded locally from this project only: ${Math.min(keywordPool.length, 150)} search terms and ${Math.min(feedPool.length, 80)} feeds.`,
  };
}

function buildKeywordPool(baseKeywords: string[], seedTerms: string[]) {
  const generated: string[] = [];
  for (const term of seedTerms) {
    generated.push(term);
    generated.push(`${term} help`);
    generated.push(`${term} advice`);
    generated.push(`${term} recommendation`);
    generated.push(`best ${term}`);
    generated.push(`need ${term}`);
    generated.push(`looking for ${term}`);
    generated.push(`${term} problem`);
  }

  return uniqueCleanList([
    ...baseKeywords,
    ...generated,
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
    .filter((word) => word.length >= 3)
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
