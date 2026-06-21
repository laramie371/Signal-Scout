import { useEffect, useRef, useState } from "react";
import { loadSettings } from "../lib/storage";
import {
  getActionSignalClass,
  getActionSignalLabel,
  getMatchStrengthClass,
  getMatchStrengthLabel,
  getOpportunityActionSignalStrength,
  getOpportunityMatchStrength,
} from "../lib/matchStrength";
import type { AiResponse, Opportunity, Project } from "../types/project";

type OpportunityCardProps = {
  opportunity: Opportunity;
  project?: Project;
  onStatusChange?: (opportunityId: string, status: Opportunity["status"]) => void;
  onUpdate?: (opportunity: Opportunity) => void;
};

export function OpportunityCard({ opportunity, project, onStatusChange, onUpdate }: OpportunityCardProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [responseError, setResponseError] = useState("");
  const cardRef = useRef<HTMLElement | null>(null);
  const matchStrength = getOpportunityMatchStrength(opportunity);
  const actionSignalStrength = getOpportunityActionSignalStrength(opportunity);

  useEffect(() => {
    const element = cardRef.current;
    if (!element || opportunity.isRead) return;

    const settings = loadSettings();
    let timer: ReturnType<typeof setTimeout>;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        timer = setTimeout(() => onUpdate?.({ ...opportunity, isRead: true }), settings.autoMarkReadSeconds * 1000);
      }
    }, { threshold: 0.5 });

    observer.observe(element);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [opportunity, onUpdate]);

  const openThread = async () => {
    if (window.signalScout?.openExternal) {
      await window.signalScout.openExternal(opportunity.url);
      return;
    }

    window.open(opportunity.url, "_blank", "noopener,noreferrer");
  };

  const copyDraft = async () => {
    await navigator.clipboard.writeText(opportunity.aiResponse?.draft || "");
  };

  const updateDraft = (draft: string) => {
    if (!opportunity.aiResponse) return;
    onUpdate?.({
      ...opportunity,
      aiResponse: {
        ...opportunity.aiResponse,
        draft,
      },
    });
  };

  const generateResponse = async () => {
    setResponseError("");

    if (!project) {
      setResponseError("Missing project details for this opportunity.");
      return;
    }

    const settings = loadSettings();
    if (!settings.openAiKey) {
      setResponseError("Add your OpenAI API key in Settings first.");
      return;
    }

    setIsGenerating(true);
    try {
      // Cost-control: response generation is intentionally manual. The app only calls OpenAI here
      // after the user clicks Generate Response for a specific lead.
      const result = await window.signalScout?.openAiDraftOpportunity({
        apiKey: settings.openAiKey,
        model: settings.openAiModel,
        project: {
          name: project.name,
          description: project.description,
          keywords: project.keywords,
          avoidKeywords: project.avoidKeywords,
          responseStyle: project.responseStyle,
        },
        opportunity: {
          title: opportunity.title,
          summary: opportunity.summary,
          source: opportunity.source,
          subreddit: opportunity.subreddit,
          url: opportunity.url,
          matchedKeywords: opportunity.matchedKeywords,
          score: opportunity.score,
          intent: opportunity.intent,
          matchExplanation: opportunity.matchExplanation,
        },
      });

      if (!result?.ok || !result.suggestion) {
        setResponseError(result?.error || "OpenAI could not generate a response.");
        return;
      }

      const aiResponse: AiResponse = {
        shouldReply: result.suggestion.shouldReply,
        confidence: result.suggestion.confidence,
        reason: result.suggestion.reason,
        draft: result.suggestion.draft,
        generatedAt: new Date().toISOString(),
      };

      onUpdate?.({ ...opportunity, aiResponse });
    } catch (error) {
      setResponseError(error instanceof Error ? error.message : "OpenAI could not generate a response.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <article ref={cardRef} className={`opportunity-card ${getMatchStrengthClass(matchStrength)}`}>
      <div className="card-topline">
        <input
          type="checkbox"
          checked={Boolean(opportunity.selected)}
          onChange={() => onUpdate?.({ ...opportunity, selected: !opportunity.selected })}
        />
        <span className="score-pill">{opportunity.score}% match</span>
        <span className={`match-strength-badge ${getMatchStrengthClass(matchStrength)}`}>{getMatchStrengthLabel(matchStrength)}</span>
        {opportunity.intent && <span className="status-pill">{formatIntent(opportunity.intent)}</span>}
        <span>{opportunity.source} / {opportunity.subreddit}</span>
      </div>

      <h3>{opportunity.title}</h3>
      <p className="muted">{opportunity.summary}</p>

      <div className="tag-row">
        {opportunity.matchedKeywords.map((keyword) => (
          <span className="match-tag" key={keyword}>{keyword}</span>
        ))}
        {opportunity.avoidedKeywords.map((keyword) => (
          <span className="avoid-tag" key={keyword}>avoid: {keyword}</span>
        ))}
        {project && <span className="project-tag">{project.name}</span>}
        {opportunity.aiReviewed && <span className="status-pill connected">AI reviewed</span>}
        {opportunity.aiReviewStatus === "failed" && <span className="status-pill danger-pill">AI review failed</span>}
        {opportunity.aiRisk && <span className="status-pill">Risk: {opportunity.aiRisk}</span>}
      </div>

      {opportunity.matchExplanation && opportunity.matchExplanation.length > 0 && (
        <div className="draft-box">
          <span>Why it matched</span>
          <ul className="explanation-list">
            {opportunity.matchExplanation.slice(0, 5).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {opportunity.aiReviewed && (
        <div className={`ai-review-panel ${getActionSignalClass(actionSignalStrength)}`}>
          <div className="tag-row">
            <span className="draft-box-title">AI Action Signal</span>
            <span className={`action-signal-badge ${getActionSignalClass(actionSignalStrength)}`}>
              {getActionSignalLabel(actionSignalStrength)}
            </span>
          </div>
          {opportunity.aiReviewReason && <p>AI review: {opportunity.aiReviewReason}</p>}
        </div>
      )}
      {opportunity.aiReviewFailed && opportunity.aiReviewError && (
        <div className="alert error-alert">AI review failed: {opportunity.aiReviewError}</div>
      )}
      {responseError && <div className="alert error-alert">{responseError}</div>}

      {opportunity.aiResponse && (
        <div className="draft-box">
          {opportunity.aiResponse.shouldReply ? (
            <>
              <span>Generated response</span>
              <p><strong>AI confidence:</strong> {opportunity.aiResponse.confidence}%</p>
              <p>{opportunity.aiResponse.reason}</p>
              <textarea value={opportunity.aiResponse.draft} onChange={(event) => updateDraft(event.target.value)} />
              <button type="button" onClick={copyDraft}>Copy Draft</button>
            </>
          ) : (
            <>
              <span>AI recommends not replying</span>
              <p><strong>AI confidence:</strong> {opportunity.aiResponse.confidence}%</p>
              <p>{opportunity.aiResponse.reason}</p>
            </>
          )}
        </div>
      )}

      <div className="card-actions">
        <button type="button" onClick={openThread}>Open thread</button>
        <button type="button" onClick={generateResponse} disabled={isGenerating}>
          {isGenerating ? "Generating..." : opportunity.aiResponse ? "Regenerate Response" : "Generate Response"}
        </button>
        <button type="button" className="ghost" onClick={() => onStatusChange?.(opportunity.id, "saved")}>Save</button>
        <button type="button" className="ghost" onClick={() => onStatusChange?.(opportunity.id, "responded")}>Responded</button>
        <button type="button" className="ghost" onClick={() => onStatusChange?.(opportunity.id, "dismissed")}>Dismiss</button>
      </div>
    </article>
  );
}

function formatIntent(intent: string) {
  return intent.replace(/_/g, " ");
}
