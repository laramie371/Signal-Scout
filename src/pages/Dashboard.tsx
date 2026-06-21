import { useState } from "react";
import type { AiMatchReview, Opportunity, Project } from "../types/project";
import { OpportunityCard } from "../components/OpportunityCard";
import { scanFeedsForProjects, type AiReviewProgress } from "../lib/rss";
import { loadLeads, loadSettings, saveLeads } from "../lib/storage";
import {
  getActionSignalRank,
  getMatchStrengthRank,
  getOpportunityActionSignalStrength,
  getOpportunityMatchStrength,
} from "../lib/matchStrength";

type DashboardProps = {
  projects: Project[];
  onOpenProjects: () => void;
};

type ScanSummary = {
  new: number;
  updated: number;
  existing: number;
  reviewFailed?: number;
};

type BulkAction = "none" | "save" | "responded" | "dismiss";

const AI_REVIEW_BATCH_SIZE = 5;

export function Dashboard({ projects, onOpenProjects }: DashboardProps) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>(() => loadLeads());
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [lastScan, setLastScan] = useState("");
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null);
  const [aiReviewProgress, setAiReviewProgress] = useState<AiReviewProgress | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [filter, setFilter] = useState<"all" | Opportunity["status"]>("all");
  const [strengthFilter, setStrengthFilter] = useState<"all" | "medium_plus" | "high">("all");
  const [actionSignalFilter, setActionSignalFilter] = useState<"all" | "reviewed" | "medium_plus" | "high">("all");
  const [sortMode, setSortMode] = useState<"default" | "ai_action">("default");
  const [bulkAction, setBulkAction] = useState<BulkAction>("none");

  const settings = loadSettings();
  const feedCount = projects.reduce((total, project) => total + project.feeds.length, 0);

  const runScan = async () => {
    if (projects.length === 0 || isScanning) return;

    setIsScanning(true);
    setScanError("");
    setScanSummary(null);
    setAiReviewProgress(null);

    try {
      const activeSettings = loadSettings();
      let latestAiReviewFailedCount = 0;
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
        onAiReviewProgress: (progress) => {
          latestAiReviewFailedCount = progress.failedCount;
          setAiReviewProgress(progress);
          if (progress.reviewedOpportunities?.length) {
            setOpportunities((current) => {
              const updated = mergeOpportunityLists(current, progress.reviewedOpportunities || []);
              saveLeads(updated);
              return updated;
            });
          }
        },
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

        const merged = mergeOpportunity(found, result);

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
      setScanSummary({ ...summary, reviewFailed: latestAiReviewFailedCount });
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

  const applyBulkAction = () => {
    if (bulkAction === "none") return;
    const nextStatus = bulkAction === "save"
      ? "saved"
      : bulkAction === "dismiss"
        ? "dismissed"
        : "responded";
    bulkStatus(nextStatus);
    setBulkAction("none");
  };

  const selectAll = () => {
    const visibleIds = new Set(visibleOpportunities.map((opportunity) => opportunity.id));
    setOpportunities((current) => current.map((opportunity) => (
      visibleIds.has(opportunity.id) ? { ...opportunity, selected: true } : opportunity
    )));
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
      if (actionSignalFilter !== "all") {
        if (!opportunity.aiReviewed) return false;
        const actionSignal = getOpportunityActionSignalStrength(opportunity);
        if (actionSignalFilter === "reviewed") return true;
        if (actionSignalFilter === "high") return actionSignal === "high";
        if (actionSignalFilter === "medium_plus") return actionSignal === "medium" || actionSignal === "high";
      }
      return true;
    })
    .sort((left, right) => {
      if (sortMode === "ai_action") {
        if (left.aiReviewed && right.aiReviewed) {
          const actionDelta = getActionSignalRank(getOpportunityActionSignalStrength(right)) - getActionSignalRank(getOpportunityActionSignalStrength(left));
          if (actionDelta !== 0) return actionDelta;
        }
        if (left.aiReviewed !== right.aiReviewed) return left.aiReviewed ? -1 : 1;
      }
      const strengthDelta = getMatchStrengthRank(getOpportunityMatchStrength(right)) - getMatchStrengthRank(getOpportunityMatchStrength(left));
      if (strengthDelta !== 0) return strengthDelta;
      return right.score - left.score || new Date(right.foundAt).getTime() - new Date(left.foundAt).getTime();
    });

  const runAiReviewForCurrentMatches = async () => {
    const activeSettings = loadSettings();
    if (!activeSettings.openAiKey || !window.signalScout?.openAiReviewOpportunity || isReviewing) return;

    const eligibleMatches = visibleOpportunities.filter((opportunity) => (
      !opportunity.aiReviewed
      && opportunity.aiReviewStatus !== "failed"
      && Boolean(opportunity.title)
      && Boolean(opportunity.url)
      && Boolean(opportunity.id)
    ));
    const reviewTargets = (activeSettings.aiReviewMode === "all"
      ? eligibleMatches
      : eligibleMatches.slice(0, activeSettings.maxAiReviewsPerScan))
      .map((opportunity) => ({
        ...opportunity,
        reviewId: getOpportunityReviewId(opportunity),
        aiReviewStatus: "pending" as const,
      }));
    const batches = chunk(reviewTargets, AI_REVIEW_BATCH_SIZE);
    const progress: AiReviewProgress = {
      isRunning: reviewTargets.length > 0,
      total: reviewTargets.length,
      reviewed: 0,
      failed: 0,
      skipped: 0,
      currentBatch: 0,
      totalBatches: batches.length,
      message: reviewTargets.length > 0 ? "AI review queued." : "No matches are ready for AI review.",
      totalReviewTargets: reviewTargets.length,
      reviewedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      remainingCount: reviewTargets.length,
    };

    console.log("[Signal Scout] dashboard AI review run started", {
      totalTargets: reviewTargets.length,
      mode: activeSettings.aiReviewMode,
      maxReviewCount: activeSettings.maxAiReviewsPerScan,
      reviewIds: reviewTargets.map((target) => target.reviewId),
    });
    setAiReviewProgress(progress);
    setIsReviewing(true);

    try {
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex];
        console.log("[Signal Scout] dashboard AI review batch started", { batchIndex: batchIndex + 1, size: batch.length });
        const settled = await reviewDashboardBatch(batch, activeSettings.openAiKey, activeSettings.openAiModel, projects);
        const updates: Opportunity[] = [];

        settled.forEach((result, index) => {
          const opportunity = batch[index];
          if (result.status === "fulfilled") {
            updates.push(applyAiReview(opportunity, result.value));
            progress.reviewedCount += 1;
            progress.reviewed += 1;
          } else {
            updates.push({
              ...opportunity,
              aiReviewed: false,
              aiReviewStatus: "failed",
              aiReviewFailed: true,
              aiReviewError: result.reason instanceof Error ? result.reason.message : "AI review failed.",
            });
            progress.failedCount += 1;
            progress.failed += 1;
          }
        });

        progress.currentBatch = batchIndex + 1;
        progress.remainingCount = Math.max(0, progress.totalReviewTargets - progress.reviewedCount - progress.failedCount - progress.skippedCount);
        progress.message = progress.remainingCount === 0
          ? `AI review complete: ${progress.reviewedCount} reviewed, ${progress.failedCount} failed, ${progress.skippedCount} skipped.`
          : `Reviewed ${progress.reviewedCount + progress.failedCount + progress.skippedCount} / ${progress.totalReviewTargets}.`;
        const nextProgress = { ...progress, reviewedOpportunities: updates };
        console.log("[Signal Scout] dashboard AI review progress", {
          ...nextProgress,
          updateIds: updates.map((update) => update.reviewId || getOpportunityReviewId(update)),
        });
        setAiReviewProgress(nextProgress);
        setOpportunities((current) => {
          const updated = mergeOpportunityLists(current, updates);
          saveLeads(updated);
          return updated;
        });
      }
    } finally {
      const doneProgress = {
        ...progress,
        isRunning: false,
        message: `AI review complete: ${progress.reviewedCount} reviewed, ${progress.failedCount} failed, ${progress.skippedCount} skipped.`,
      };
      console.log("[Signal Scout] dashboard AI review run finished", doneProgress);
      setAiReviewProgress(doneProgress);
      setIsReviewing(false);
    }
  };

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
        <button className="ghost" type="button" onClick={runAiReviewForCurrentMatches} disabled={projects.length === 0 || isScanning || isReviewing || !settings.openAiKey}>
          {isReviewing ? "Reviewing..." : "Review visible matches with AI"}
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
              {typeof scanSummary.reviewFailed === "number" && scanSummary.reviewFailed > 0 && ` / AI review failed: ${scanSummary.reviewFailed}`}
            </>
          )}
        </div>
      )}
      {aiReviewProgress && (
        <div className="alert info-alert">
          {aiReviewProgress.message || `Reviewed ${aiReviewProgress.reviewedCount} of ${aiReviewProgress.totalReviewTargets} matches.`}
          <br />
          Reviewed {aiReviewProgress.reviewedCount} / {aiReviewProgress.totalReviewTargets}
          {` | Failed ${aiReviewProgress.failedCount}`}
          {` | Skipped ${aiReviewProgress.skippedCount}`}
          {aiReviewProgress.totalBatches > 0 && ` | Batch ${aiReviewProgress.currentBatch} / ${aiReviewProgress.totalBatches}`}
        </div>
      )}

      <section className="metric-grid">
        <div className="metric-card"><strong>{projects.length}</strong><span>Projects</span></div>
        <div className="metric-card"><strong>{visibleOpportunities.length}</strong><span>Active matches</span></div>
        <div className="metric-card"><strong>{feedCount}</strong><span>RSS feeds</span></div>
      </section>

      <section className="panel controls-panel">
        <div className="control-grid">
          <label className="compact-control">
            Status
            <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
              <option value="all">All active</option>
              <option value="new">New</option>
              <option value="saved">Saved</option>
              <option value="responded">Responded</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </label>
          <label className="compact-control">
            Match strength
            <select value={strengthFilter} onChange={(event) => setStrengthFilter(event.target.value as typeof strengthFilter)}>
              <option value="all">All matches</option>
              <option value="medium_plus">Medium+</option>
              <option value="high">High only</option>
            </select>
          </label>
          <label className="compact-control">
            AI action
            <select value={actionSignalFilter} onChange={(event) => setActionSignalFilter(event.target.value as typeof actionSignalFilter)}>
              <option value="all">All AI actions</option>
              <option value="reviewed">All AI reviewed</option>
              <option value="medium_plus">AI Medium+</option>
              <option value="high">AI High only</option>
            </select>
          </label>
          <label className="compact-control">
            Sort
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)}>
              <option value="default">Default sort</option>
              <option value="ai_action">AI action signal</option>
            </select>
          </label>
        </div>
        <div className="controls-actions">
          <button type="button" className="ghost" onClick={selectAll}>Select all visible</button>
          <label className="compact-control bulk-control">
            Bulk action
            <select value={bulkAction} onChange={(event) => setBulkAction(event.target.value as BulkAction)}>
              <option value="none">Choose action</option>
              <option value="save">Save selected</option>
              <option value="responded">Mark responded</option>
              <option value="dismiss">Dismiss selected</option>
            </select>
          </label>
          <button type="button" className="ghost" onClick={applyBulkAction} disabled={bulkAction === "none"}>Apply</button>
          <button type="button" className="ghost" onClick={dismissRead}>Dismiss all read</button>
        </div>
      </section>

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

function mergeOpportunity(found: Opportunity, result: Opportunity): Opportunity {
  return {
    ...result,
    status: found.status,
    isRead: found.isRead,
    selected: found.selected,
    foundAt: found.foundAt,
    lastSeenAt: new Date().toISOString(),
    aiResponse: found.aiResponse,
    aiReviewed: result.aiReviewed || found.aiReviewed,
    aiMatchStrength: result.aiMatchStrength ?? found.aiMatchStrength,
    matchStrength: result.matchStrength ?? found.matchStrength,
    actionSignalStrength: result.actionSignalStrength ?? found.actionSignalStrength,
    aiRisk: result.aiRisk ?? found.aiRisk,
    aiReviewReason: result.aiReviewReason ?? found.aiReviewReason,
    aiReviewFailed: result.aiReviewFailed ?? found.aiReviewFailed,
    aiReviewError: result.aiReviewError ?? found.aiReviewError,
    reviewId: result.reviewId ?? found.reviewId,
    aiReviewStatus: result.aiReviewStatus ?? found.aiReviewStatus,
  };
}

function mergeOpportunityLists(current: Opportunity[], incoming: Opportunity[]) {
  const map = new Map(current.map((opportunity) => [opportunityKey(opportunity), opportunity]));
  const reviewIdMap = new Map(current.map((opportunity) => [getOpportunityReviewId(opportunity), opportunityKey(opportunity)]));

  for (const opportunity of incoming) {
    const reviewId = getOpportunityReviewId(opportunity);
    const key = reviewIdMap.get(reviewId) || opportunityKey(opportunity);
    const found = map.get(key);
    map.set(key, found ? mergeOpportunity(found, opportunity) : opportunity);
  }

  return Array.from(map.values());
}

function opportunityKey(opportunity: Opportunity) {
  return opportunity.url || opportunity.id || `${opportunity.title}:${opportunity.source}`;
}

function getOpportunityReviewId(opportunity: Opportunity) {
  return opportunity.reviewId
    || opportunity.id
    || opportunity.url
    || `${opportunity.source}:${opportunity.title}:${opportunity.foundAt || ""}`;
}

async function reviewDashboardBatch(batch: Opportunity[], apiKey: string, model: string, projects: Project[]) {
  const settled = await Promise.allSettled(batch.map((opportunity) => (
    reviewDashboardOpportunity(opportunity, apiKey, model, projects)
  )));
  const allFailed = settled.length > 0 && settled.every((result) => result.status === "rejected");

  if (!allFailed) {
    console.log("[Signal Scout] dashboard AI review batch success", {
      resultCount: settled.filter((result) => result.status === "fulfilled").length,
      failedCount: settled.filter((result) => result.status === "rejected").length,
    });
    return settled;
  }

  console.warn("[Signal Scout] dashboard AI review batch failed; retrying once", settled.map((result) => (
    result.status === "rejected" ? formatReviewError(result.reason) : "unknown"
  )));
  await wait(750);
  const retrySettled = await Promise.allSettled(batch.map((opportunity) => (
    reviewDashboardOpportunity(opportunity, apiKey, model, projects)
  )));
  console.log("[Signal Scout] dashboard AI review batch retry finished", {
    resultCount: retrySettled.filter((result) => result.status === "fulfilled").length,
    failedCount: retrySettled.filter((result) => result.status === "rejected").length,
  });
  return retrySettled;
}

async function reviewDashboardOpportunity(opportunity: Opportunity, apiKey: string, model: string, projects: Project[]) {
  const project = projects.find((item) => item.id === opportunity.projectId);
  if (!project) throw new Error("Missing project for AI review.");
  const reviewId = getOpportunityReviewId(opportunity);

  const result = await window.signalScout?.openAiReviewOpportunity({
    apiKey,
    model,
    project: {
      name: project.name,
      description: project.description,
      keywords: project.keywords,
      avoidKeywords: project.avoidKeywords,
      responseStyle: project.responseStyle,
    },
    opportunity: {
      reviewId,
      title: opportunity.title,
      summary: opportunity.summary,
      source: opportunity.subreddit || opportunity.source,
      url: opportunity.url,
      matchedKeywords: opportunity.matchedKeywords,
      score: opportunity.score,
      intent: opportunity.intent || "not_clear",
      matchExplanation: opportunity.matchExplanation || [],
    },
  });

  if (!result?.ok || !result.review) {
    throw new Error(result?.error || "AI review returned no result.");
  }

  if (result.review.reviewId && result.review.reviewId !== reviewId) {
    console.warn("[Signal Scout] dashboard AI review ID mismatch", {
      expected: reviewId,
      received: result.review.reviewId,
    });
  }

  return { ...result.review, reviewId };
}

function applyAiReview(opportunity: Opportunity, review: AiMatchReview): Opportunity {
  return {
    ...opportunity,
    reviewId: review.reviewId || getOpportunityReviewId(opportunity),
    aiReviewed: true,
    aiReviewStatus: "reviewed",
    aiReviewFailed: false,
    aiReviewError: undefined,
    aiMatchStrength: review.matchScore,
    matchStrength: review.matchStrength,
    actionSignalStrength: review.actionSignalStrength,
    aiRisk: review.risk,
    aiReviewReason: review.reason,
    intent: review.isOpportunity && review.opportunityType !== "not_relevant" ? review.opportunityType : opportunity.intent,
  };
}

function formatReviewError(error: unknown) {
  return error instanceof Error ? error.message : "AI review failed.";
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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
    || current.actionSignalStrength !== next.actionSignalStrength
    || current.aiRisk !== next.aiRisk
    || current.aiReviewReason !== next.aiReviewReason
    || current.aiReviewFailed !== next.aiReviewFailed
    || current.aiReviewError !== next.aiReviewError
    || current.reviewId !== next.reviewId
    || current.aiReviewStatus !== next.aiReviewStatus
    || JSON.stringify(current.matchExplanation || []) !== JSON.stringify(next.matchExplanation || [])
    || !sameStringArray(current.matchedKeywords, next.matchedKeywords)
    || !sameStringArray(current.avoidedKeywords, next.avoidedKeywords)
    || current.aiReason !== next.aiReason;
}

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}
