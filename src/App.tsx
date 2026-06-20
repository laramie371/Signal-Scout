import { useEffect, useState } from "react";
import "./App.css";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { Projects } from "./pages/Projects";
import { Settings } from "./pages/Settings";
import { loadLeads, loadProjects, saveLeads, saveProjects } from "./lib/storage";
import type { AppPage, Project } from "./types/project";

function App() {
  const [page, setPage] = useState<AppPage>("dashboard");
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    setProjects(loadProjects());
  }, []);

  const updateProjects = (nextProjects: Project[]) => {
    setProjects(nextProjects);
    saveProjects(nextProjects);
  };

  const addProject = (project: Project) => {
    updateProjects([project, ...projects]);
  };

  const deleteProject = (projectId: string) => {
    saveLeads(loadLeads().filter((lead) => lead.projectId !== projectId));
    updateProjects(projects.filter((project) => project.id !== projectId));
  };

  return (
    <div className="app-shell">
      <Sidebar page={page} onChange={setPage} />
      <div className="app-content">
        {page === "dashboard" && <Dashboard projects={projects} onOpenProjects={() => setPage("projects")} />}
        {page === "projects" && <Projects projects={projects} onAddProject={addProject} onDeleteProject={deleteProject} />}
        {page === "settings" && <Settings onRestoreProjects={updateProjects} />}
      </div>
    </div>
  );
}

export default App;
