export const SOFTWARE_SKILLS = [
  "React",
  "Next.js",
  "Vue.js",
  "Angular",
  "Svelte",
  "Nuxt.js",
  "Remix",
  "Astro",
  "Tailwind CSS",
  "Bootstrap",
  "HTML",
  "CSS",
  "JavaScript",
  "TypeScript",
  "Node.js",
  "Express.js",
  "NestJS",
  "Python",
  "Django",
  "Flask",
  "FastAPI",
  "Java",
  "Spring Boot",
  "Kotlin",
  "Swift",
  "Objective-C",
  "C",
  "C++",
  "C#",
  ".NET",
  "ASP.NET",
  "PHP",
  "Laravel",
  "CodeIgniter",
  "Ruby",
  "Ruby on Rails",
  "Go",
  "Rust",
  "Scala",
  "Elixir",
  "React Native",
  "Flutter",
  "Ionic",
  "Kubernetes",
  "Docker",
  "AWS",
  "Azure",
  "GCP",
  "Firebase",
  "Supabase",
  "MongoDB",
  "PostgreSQL",
  "MySQL",
  "SQLite",
  "Redis",
  "Elasticsearch",
  "GraphQL",
  "REST APIs",
  "gRPC",
  "Microservices",
  "DevOps",
  "CI/CD",
  "Linux",
  "Terraform",
  "Ansible",
  "Git",
  "GitHub Actions",
  "Jenkins",
  "Nginx",
  "Apache",
  "WordPress",
  "Shopify",
  "Webflow",
  "Figma",
  "UI/UX Design",
  "Adobe XD",
  "SEO",
  "Google Ads",
  "Content Writing",
  "Copywriting",
  "Data Analysis",
  "Machine Learning",
  "Deep Learning",
  "AI/LLM",
  "TensorFlow",
  "PyTorch",
  "OpenCV",
  "Power BI",
  "Tableau",
  "QA Testing",
  "Automation Testing",
  "Manual Testing",
  "Cypress",
  "Playwright",
  "Selenium",
  "Jest",
  "Mocha",
  "Project Management",
  "Product Management",
  "Agile",
  "Scrum",
  "Business Analysis",
  "Salesforce",
  "SAP",
  "Blockchain",
  "Solidity",
  "Web3",
  "Unity",
  "Unreal Engine",
  "Three.js",
  "Photoshop",
  "Illustrator",
  "Video Editing",
  "After Effects",
  "Premiere Pro",
  "Canva",
  "Notion",
  "ClickUp",
  "Jira",
  "Slack"
];

export const toSkillKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export const hasExactSkillMatch = (value, skillLibrary = SOFTWARE_SKILLS) => {
  const key = toSkillKey(value);
  if (!key) return false;
  return skillLibrary.some((skill) => toSkillKey(skill) === key);
};

export const getCanonicalSkill = (value, skillLibrary = SOFTWARE_SKILLS) => {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "";
  const key = toSkillKey(cleaned);
  const matched = skillLibrary.find((skill) => toSkillKey(skill) === key);
  return matched || cleaned;
};

export const filterSkillSuggestions = ({
  query = "",
  selectedSkills = [],
  skillLibrary = SOFTWARE_SKILLS,
  limit = 80
} = {}) => {
  const cleanedQuery = String(query || "").trim();
  const queryLower = cleanedQuery.toLowerCase();
  const queryKey = toSkillKey(cleanedQuery);
  const selectedKeys = new Set(
    selectedSkills.map((skill) => toSkillKey(skill)).filter(Boolean)
  );

  const available = skillLibrary.filter(
    (skill) => !selectedKeys.has(toSkillKey(skill))
  );

  if (!cleanedQuery) {
    return available.slice(0, limit);
  }

  return available
    .map((skill) => {
      const skillLower = skill.toLowerCase();
      const skillKey = toSkillKey(skill);
      const startsWith = skillLower.startsWith(queryLower) || skillKey.startsWith(queryKey);
      const includes = skillLower.includes(queryLower) || skillKey.includes(queryKey);
      if (!startsWith && !includes) return null;

      let score = 0;
      if (includes) score += 1;
      if (startsWith) score += 3;
      if (skillLower === queryLower || skillKey === queryKey) score += 6;

      return { skill, score };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.skill.localeCompare(right.skill))
    .slice(0, limit)
    .map((entry) => entry.skill);
};
