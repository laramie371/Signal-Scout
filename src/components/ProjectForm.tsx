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

      setKeywords(formatListForTextarea(result.suggestion.keywords));
      setFeeds(formatListForTextarea(result.suggestion.feeds));
      setResponseStyle(result.suggestion.responseStyle);
      setAiMessage(result.suggestion.reasoning || "Project setup generated. Review and edit before saving.");
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
