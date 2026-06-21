import { useEffect, useRef, useState } from "react";
import type { Project } from "../types/project";
import { buildBackup, loadSettings, parseBackup, restoreBackup, saveSettings } from "../lib/storage";

type SettingsProps = {
  onRestoreProjects: (projects: Project[]) => void;
};

export function Settings({ onRestoreProjects }: SettingsProps) {
  const [settings, setSettings] = useState(() => loadSettings());
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [testError, setTestError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const updateSetting = <Key extends keyof typeof settings>(key: Key, value: typeof settings[Key]) => {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      saveSettings(next);
      return next;
    });
  };

  const save = () => {
    saveSettings(settings);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const testOpenAi = async () => {
    setTesting(true);
    setTestMessage("");
    setTestError("");

    try {
      const result = await window.signalScout?.openAiTest({ apiKey: settings.openAiKey, model: settings.openAiModel });
      if (!result?.ok) {
        setTestError(result?.error || "OpenAI test failed.");
        return;
      }
      setTestMessage(result.message || "OpenAI connection works.");
    } catch (error) {
      setTestError(error instanceof Error ? error.message : "OpenAI test failed.");
    } finally {
      setTesting(false);
    }
  };

  const exportBackup = (label: "projects" | "leads") => {
    const backup = buildBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `signal-scout-${label}-backup.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setImportMessage("");
    setImportError("");

    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const parsed = parseBackup(JSON.parse(await file.text()));
      if (!parsed) {
        setImportError("Backup must contain projects, leads, and settings.");
        return;
      }

      if (!window.confirm("Importing this backup will overwrite current projects, leads, and settings. Continue?")) return;

      restoreBackup(parsed);
      setSettings(parsed.settings);
      onRestoreProjects(parsed.projects);
      setImportMessage("Backup imported.");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Could not import backup.");
    }
  };

  return (
    <main className="page-stack">
      <section className="section-heading">
        <p className="eyebrow">Settings</p>
        <h2>Local integrations</h2>
        <p>
          RSS scanning works without external API keys. OpenAI is optional and powers project setup suggestions,
          opportunity summaries, and response drafts when configured.
        </p>
      </section>

      <section className="panel form-grid">
        <div className="settings-section-header">
          <div>
            <p className="eyebrow">RSS scanning</p>
            <h3>No Reddit API required</h3>
          </div>
          <span className="status-pill connected">Ready</span>
        </div>

        <div className="alert info-alert">
          Add RSS feeds on each project. Reddit feeds like <strong>https://www.reddit.com/r/webdev/new.rss</strong> work immediately,
          and any normal RSS or Atom feed can be scanned the same way.
        </div>
      </section>

      <section className="panel form-grid">
        <div className="settings-section-header">
          <div>
            <p className="eyebrow">Scanning</p>
            <h3>Scan controls</h3>
          </div>
        </div>

        <div>
          <p className="eyebrow">Keyword matching</p>
          <div className="button-row">
            <label className="checkbox-label">
              <input
                type="radio"
                name="keywordMatchMode"
                checked={settings.keywordMatchMode === "high_recall"}
                onChange={() => updateSetting("keywordMatchMode", "high_recall")}
              />
              High Recall Mode
            </label>
            <label className="checkbox-label">
              <input
                type="radio"
                name="keywordMatchMode"
                checked={settings.keywordMatchMode === "exact_phrase"}
                onChange={() => updateSetting("keywordMatchMode", "exact_phrase")}
              />
              Exact Phrase Mode
            </label>
          </div>
          <small>High Recall Mode is recommended. It expands phrases into searchable terms, then lets scoring and optional AI review narrow the results.</small>
        </div>

        <div className="two-column-grid">
          <label>
            Minimum Opportunity Score
            <input
              type="number"
              min={0}
              max={99}
              value={settings.minimumOpportunityScore}
              onChange={(event) => updateSetting("minimumOpportunityScore", Number(event.target.value))}
            />
          </label>

          <label>
            Posts Per Feed
            <input
              type="number"
              min={1}
              max={150}
              value={settings.postsPerFeed}
              onChange={(event) => updateSetting("postsPerFeed", Number(event.target.value))}
            />
          </label>

          <label>
            Max Feed Age (Days)
            <input
              type="number"
              min={1}
              max={365}
              value={settings.maxFeedAgeDays}
              onChange={(event) => updateSetting("maxFeedAgeDays", Number(event.target.value))}
            />
          </label>

          <label>
            Auto Mark Read After (Seconds)
            <input
              type="number"
              min={0}
              max={60}
              value={settings.autoMarkReadSeconds}
              onChange={(event) => updateSetting("autoMarkReadSeconds", Number(event.target.value))}
            />
          </label>
        </div>
      </section>

      <section className="panel form-grid">
        <div className="settings-section-header">
          <div>
            <p className="eyebrow">Visibility</p>
            <h3>Dashboard filters</h3>
          </div>
        </div>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.hideDismissed}
            onChange={(event) => updateSetting("hideDismissed", event.target.checked)}
          />
          Hide Dismissed Leads
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.hideResponded}
            onChange={(event) => updateSetting("hideResponded", event.target.checked)}
          />
          Hide Responded Leads
        </label>
      </section>

      <section className="panel form-grid">
        <div className="settings-section-header">
          <div>
            <p className="eyebrow">AI Match Review</p>
            <h3>Optional review for strong matches</h3>
          </div>
        </div>

        <div className="alert info-alert">
          Signal Scout does not send every feed item to OpenAI. It first uses local keyword and intent scoring, then optionally asks AI to review only the strongest matches.
        </div>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.enableAiMatchReview}
            onChange={(event) => updateSetting("enableAiMatchReview", event.target.checked)}
          />
          Enable AI match review
        </label>

        <div className="two-column-grid">
          <label>
            AI review threshold
            <input
              type="number"
              min={0}
              max={100}
              value={settings.aiReviewThreshold}
              onChange={(event) => updateSetting("aiReviewThreshold", Number(event.target.value))}
            />
          </label>

          <label>
            Max AI reviews per scan
            <input
              type="number"
              min={0}
              max={100}
              value={settings.maxAiReviewsPerScan}
              onChange={(event) => updateSetting("maxAiReviewsPerScan", Number(event.target.value))}
            />
          </label>
        </div>
      </section>

      <section className="panel form-grid">
        <div className="settings-section-header">
          <div>
            <p className="eyebrow">Backup</p>
            <h3>Import and export</h3>
          </div>
        </div>

        <div className="button-row">
          <button className="ghost" type="button" onClick={() => exportBackup("projects")}>Export Projects</button>
          <button className="ghost" type="button" onClick={() => exportBackup("leads")}>Export Leads</button>
          <button className="ghost" type="button" onClick={() => fileInputRef.current?.click()}>Import Backup</button>
        </div>
        <input ref={fileInputRef} className="hidden-input" type="file" accept="application/json,.json" onChange={importBackup} />
        {importMessage && <div className="alert success-alert">{importMessage}</div>}
        {importError && <div className="alert error-alert">{importError}</div>}
      </section>

      <section className="panel form-grid">
        <div className="settings-section-header">
          <div>
            <p className="eyebrow">OpenAI</p>
            <h3>Optional AI suggestions</h3>
          </div>
          <span className={settings.openAiKey ? "status-pill connected" : "status-pill"}>{settings.openAiKey ? "Configured" : "Optional"}</span>
        </div>

        <label>
          OpenAI API key
          <input
            type="password"
            value={settings.openAiKey}
            onChange={(event) => updateSetting("openAiKey", event.target.value)}
            placeholder="sk-..."
          />
          <small>Stored locally in this app. It is only sent to OpenAI when you click an AI action.</small>
        </label>

        <label>
          Model
          <input
            value={settings.openAiModel}
            onChange={(event) => updateSetting("openAiModel", event.target.value)}
            placeholder="gpt-4o-mini"
          />
          <small>Default: gpt-4o-mini. Change this later if you want to test another compatible model.</small>
        </label>

        <div className="button-row">
          <button className="primary-button" type="button" onClick={save}>Save settings</button>
          <button className="ghost" type="button" onClick={testOpenAi} disabled={!settings.openAiKey.trim() || testing}>
            {testing ? "Testing..." : "Test OpenAI"}
          </button>
        </div>

        {saved && <p className="success-text">Saved.</p>}
        {testMessage && <div className="alert success-alert">{testMessage}</div>}
        {testError && <div className="alert error-alert">{testError}</div>}
      </section>
    </main>
  );
}
