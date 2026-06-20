import { useState } from "react";
import { ProjectForm } from "../components/ProjectForm";
import { loadLeads, saveLeads } from "../lib/storage";
import type { Opportunity, Project } from "../types/project";

type ProjectsProps = {
  projects: Project[];
  onAddProject: (project: Project) => void;
  onDeleteProject: (projectId: string) => void;
};

export function Projects({ projects, onAddProject, onDeleteProject }: ProjectsProps) {
  const [leads, setLeads] = useState<Opportunity[]>(() => loadLeads());

  const resetDismissed = (projectId: string) => {
    if (!window.confirm("Reset dismissed leads for this project to new?")) return;

    const updated = leads.map((lead) => (
      lead.projectId === projectId && lead.status === "dismissed"
        ? { ...lead, status: "new" as const }
        : lead
    ));
    saveLeads(updated);
    setLeads(updated);
  };

  const resetAllStatuses = (projectId: string) => {
    if (!window.confirm("Reset saved, responded, and dismissed leads for this project to new?")) return;

    const updated = leads.map((lead) => (
      lead.projectId === projectId && (lead.status === "saved" || lead.status === "responded" || lead.status === "dismissed")
        ? { ...lead, status: "new" as const }
        : lead
    ));
    saveLeads(updated);
    setLeads(updated);
  };

  return (
    <main className="page-stack">
      <section className="section-heading">
        <p className="eyebrow">Projects</p>
        <h2>Teach Signal Scout what to watch for.</h2>
        <p>Each project gets its own RSS feeds, focus keywords, avoid terms, and response style.</p>
      </section>

      <ProjectForm onAdd={onAddProject} />

      <section className="project-list">
        {projects.map((project) => (
          <article className="panel project-card" key={project.id}>
            <div>
              <h3>{project.name}</h3>
              <p>{project.description || "No description yet."}</p>
            </div>

            <div className="tag-row">
              {projectStats(project.id, leads).map((stat) => (
                <span className="status-pill" key={stat.label}>{stat.label}: {stat.value}</span>
              ))}
            </div>

            {project.feeds.length > 0 && (
              <div className="feed-list">
                {project.feeds.map((feed) => <span className="feed-pill" key={feed}>{shortFeed(feed)}</span>)}
              </div>
            )}

            <div className="tag-row">
              {project.keywords.map((keyword) => <span className="match-tag" key={keyword}>{keyword}</span>)}
            </div>

            {project.avoidKeywords.length > 0 && (
              <div className="tag-row">
                {project.avoidKeywords.map((keyword) => <span className="avoid-tag" key={keyword}>{keyword}</span>)}
              </div>
            )}

            <div className="button-row">
              <button className="ghost" type="button" onClick={() => resetDismissed(project.id)}>Reset Dismissed</button>
              <button className="ghost" type="button" onClick={() => resetAllStatuses(project.id)}>Reset All Statuses</button>
              <button className="ghost danger" type="button" onClick={() => onDeleteProject(project.id)}>Delete</button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function projectStats(projectId: string, leads: Opportunity[]) {
  const projectLeads = leads.filter((lead) => lead.projectId === projectId);
  return [
    { label: "Leads", value: projectLeads.length },
    { label: "Saved", value: projectLeads.filter((lead) => lead.status === "saved").length },
    { label: "Responded", value: projectLeads.filter((lead) => lead.status === "responded").length },
    { label: "Dismissed", value: projectLeads.filter((lead) => lead.status === "dismissed").length },
  ];
}

function shortFeed(feed: string) {
  const reddit = feed.match(/reddit\.com\/r\/([^/]+)/i);
  if (reddit) return `r/${reddit[1]}`;

  try {
    const url = new URL(feed);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return feed;
  }
}
