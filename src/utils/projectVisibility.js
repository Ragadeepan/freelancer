const HIDDEN_TITLE_TOKENS = ["visionmeet"];

const normalize = (value) => String(value || "").trim().toLowerCase();

export function isHiddenProject(project) {
  const title = normalize(project?.jobTitle || project?.title || project?.projectTitle);
  if (!title) return false;
  return HIDDEN_TITLE_TOKENS.some((token) => title.includes(token));
}

export function filterVisibleProjects(projects = []) {
  return projects.filter((project) => !isHiddenProject(project));
}
