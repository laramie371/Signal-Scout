import { useState } from "react";
import type { Opportunity, Project } from "../types/project";
import { OpportunityCard } from "../components/OpportunityCard";
import { scanFeedsForProjects } from "../lib/rss";
import { loadLeads, loadSettings, saveLeads } from "../lib/storage";
import { getMatchStrengthRank, getOpportunityMatchStrength } from "../lib/matchStrength";

type DashboardProps = {
  projects: Project[];
  onOpenProjects: () => void;
};

type ScanSummary = {
  new: number;
  updated: number;
  existing: number;
};

export function Dashboard({ projects, onOpenProjects }: DashboardProps) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>(() => loadLeads());
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [lastScan, setLastScan] = useState("");
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null);
  const [filter, setFilter] = useState<"all" | Opportunity["status"]>("all");
  const [strengthFilter, setStrengthFilter] = useState<"all" | "medium_plus" | "high">("all");

  const settings = loadSettings();
  const feedCount = projects.reduce((total, project) => total + project.feeds.length, 0);

  const runScan = async () => {
    if (projects.length === 0 || isScanning) return;

    setIsScanning(true);
    setScanError("");
    setScanSummary(null);

    try {
      const activeSettings = loadSettings();
      const results = await scanFeedsForProjects(projects, {
        minimumOpportunityScore: activeSettings.minimumOpportunityScore,
        postsPerFeed: activeSettings.postsPerFeed,
        maxFeedAgeDays: activeSettings.maxFeedAgeDays,
        openAiKey: activeSettings.openAiKey,
        openAiModel: activeSettings.openAiModel,
        enableAiMatchReview: activeSettings.enableAiMatchReview,
        aiReviewThreshold: activeSettings.aiReviewThreshold,
        maxAiReviewsPerScan: activeSettings.maxAiReviewsPerScan,
        aiReviewMode: activeSettings.aiReviewMode,
        keywordMatchMode: activeSettings.keywordMatchMode,
      });
      const existing = loadLeads();
      const map = new Map(existing.map((lead) => [lead.url, lead]));
      const summary: ScanSummary = { new: 0, updated: 0, existing: 0 };

      for (const result of results) {
        const found = map.get(result.url);

        if (!found) {
          map.set(result.url, { ...result, lastSeenAt: new Date().toISOString() });
          summary.new += 1;
          continue;
        }

        const merged: Opportunity = {
          ...result,
          status: found.status,
          isRead: found.isRead,
          selected: found.selected,
          foundAt: found.foundAt,
          lastSeenAt: new Date().toISOString(),
        };

        if (hasOpportunityChanged(found, merged)) {
          map.set(result.url, merged);
          summary.updated += 1;
        } else {
          map.set(result.url, { ...found, lastSeenAt: merged.lastSeenAt });
          summary.existing += 1;
        }
      }

      const merged = Array.from(map.values());
      saveLeads(merged);
      setOpportunities(merged);
      setLastScan(new Date().toLocaleString());
      setScanSummary(summary);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "RSS scan failed.");
    } finally {
      setIsScanning(false);
    }
  };

  const updateOpportunityStatus = (opportunityId: string, status: Opportunity["status"]) => {
    setOpportunities((current) => {
      const updated = current.map((opportunity) => (
        opportunity.id === opportunityId ? { ...opportunity, status } : opportunity
      ));
      saveLeads(updated);
      return updated;
    });
  };

  const updateOpportunity = (nextOpportunity: Opportunity) => {
    setOpportunities((current) => {
      const updated = current.map((opportunity) => (
        opportunity.id === nextOpportunity.id ? nextOpportunity : opportunity
      ));
      saveLeads(updated);
      return updated;
    });
  };

  const bulkStatus = (status: Opportunity["status"]) => {
    const updated = opportunities.map((opportunity) => (
      opportunity.selected ? { ...opportunity, status } : opportunity
    ));
    saveLeads(updated);
    setOpportunities(updated);
  };

  const selectAll = () => {
    setOpportunities((current) => current.map((opportunity) => ({ ...opportunity, selected: true })));
  };

  const dismissRead = () => {
    const updated = opportunities.map((opportunity) => (
      opportunity.isRead && opportunity.status === "new"
        ? { ...opportunity, status: "dismissed" as const }
        : opportunity
    ));
    saveLeads(updated);
    setOpportunities(updated);
  };

  const visibleOpportunities = opportunities
    .filter((opportunity) => {
      if (filter !== "all" && opportunity.status !== filter) return false;
      if (filter === "all" && settings.hideDismissed && opportunity.status === "dismissed") return false;
      if (filter === "all" && settings.hideResponded && opportunity.status === "responded") return false;

      const strength = getOpportunityMatchStrength(opportunity);
      if (strengthFilter === "high") return strength === "high";
      if (strengthFilter === "medium_plus") return strength === "medium" || strength === "high";
      return true;
    })
    .sort((left, right) => {
      const strengthDelta = getMatchStrengthRank(getOpportunityMatchStrength(right)) - getMatchStrengthRank(getOpportunityMatchStrength(left));
      if (strengthDelta !== 0) return strengthDelta;
      return right.score - left.score || new Date(right.foundAt).getTime() - new Date(left.foundAt).getTime();
    });

  return (
    <main className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>Find conversations worth joining.</h2>
          <p>
            Signal Scout scans RSS feeds, scores fresh posts against your project keywords, and can generate a careful response when you choose one lead.
          </p>
        </div>
        <button className="primary-button" type="button" onClick={runScan} disabled={projects.length === 0 || isScanning}>
          {isScanning ? "Scanning feeds..." : "Run RSS scan"}
        </button>
      </section>

      <div className="alert info-alert">
        RSS mode: no Reddit API key required. Each project scans up to 60 feeds x {settings.postsPerFeed} recent items, then scores matches locally.
        More focused feeds and lower score thresholds will surface more leads.
      </div>

      {scanError && <div className="alert error-alert">{scanError}</div>}
      {lastScan && (
        <div className="alert success-alert">
          <strong>Scan Complete</strong>
          <br />
          Last scan: {lastScan}
          {scanSummary && (
            <>
              <br />
              New: {scanSummary.new} / Updated: {scanSummary.updated} / Existing: {scanSummary.existing}
            </>
          )}
        </div>
      )}

      <section className="metric-grid">
        <div className="metric-card"><strong>{projects.length}</strong><span>Projects</span></div>
        <div className="metric-card"><strong>{visibleOpportunities.length}</strong><span>Active matches</span></div>
        <div className="metric-card"><strong>{feedCount}</strong><span>RSS feeds</span></div>
      </section>

      <div className="tag-row">
        <button type="button" onClick={() => setFilter("all")}>All</button>
        <button type="button" onClick={() => setFilter("new")}>New</button>
        <button type="button" onClick={() => setFilter("saved")}>Saved</button>
        <button type="button" onClick={() => setFilter("responded")}>Responded</button>
        <button type="button" onClick={() => setFilter("dismissed")}>Dismissed</button>
        <button type="button" onClick={selectAll}>Select All</button>
        <button type="button" onClick={() => bulkStatus("saved")}>Save Selected</button>
        <button type="button" onClick={() => bulkStatus("responded")}>Responded Selected</button>
        <button type="button" onClick={() => bulkStatus("dismissed")}>Dismiss Selected</button>
        <button type="button" onClick={dismissRead}>Dismiss All Read</button>
      </div>

      <div className="tag-row">
        <button type="button" onClick={() => setStrengthFilter("all")}>All matches</button>
        <button type="button" onClick={() => setStrengthFilter("medium_plus")}>Medium+</button>
        <button type="button" onClick={() => setStrengthFilter("high")}>High only</button>
      </div>

      <section className="section-heading">
        <p className="eyebrow">Opportunity queue</p>
        <h2>Review matches</h2>
      </section>

      {projects.length === 0 ? (
        <div className="empty-state panel">
          <h3>No projects yet</h3>
          <p>Create your first project profile before scanning RSS feeds for opportunities.</p>
          <button className="primary-button" type="button" onClick={onOpenProjects}>Add project</button>
        </div>
      ) : visibleOpportunities.length === 0 ? (
        <div className="empty-state panel">
          <h3>{isScanning ? "Scanning feeds..." : "No matches loaded yet"}</h3>
          <p>
            {isScanning
              ? "Checking recent RSS items that match your project keywords."
              : "Run a scan to pull fresh feed items. Add specific focus keywords for better results."}
          </p>
          {!isScanning && <button className="primary-button" type="button" onClick={runScan}>Run RSS scan</button>}
        </div>
      ) : (
        <div className="opportunity-grid">
          {visibleOpportunities.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              opportunity={opportunity}
              project={projects.find((project) => project.id === opportunity.projectId)}
              onStatusChange={updateOpportunityStatus}
              onUpdate={updateOpportunity}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function hasOpportunityChanged(current: Opportunity, next: Opportunity) {
  return current.score !== next.score
    || current.title !== next.title
    || current.source !== next.source
    || current.subreddit !== next.subreddit
    || current.summary !== next.summary
    || current.intent !== next.intent
    || current.intentScore !== next.intentScore
    || current.aiReviewed !== next.aiReviewed
    || current.aiMatchStrength !== next.aiMatchStrength
    || current.matchStrength !== next.matchStrength
    || current.aiRisk !== next.aiRisk
    || current.aiReviewReason !== next.aiReviewReason
    || JSON.stringify(current.matchExplanation || []) !== JSON.stringify(next.matchExplanation || [])
    || !sameStringArray(current.matchedKeywords, next.matchedKeywords)
    || !sameStringArray(current.avoidedKeywords, next.avoidedKeywords)
    || current.aiReason !== next.aiReason;
}

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}
