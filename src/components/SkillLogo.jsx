import {
  siAngular,
  siAnsible,
  siApache,
  siAsana,
  siAstro,
  siBehance,
  siBlender,
  siBootstrap,
  siC,
  siChartdotjs,
  siClickup,
  siCloudflare,
  siCodeigniter,
  siCplusplus,
  siCss,
  siCypress,
  siDjango,
  siDocker,
  siDotnet,
  siElasticsearch,
  siElixir,
  siEthereum,
  siExpress,
  siFacebook,
  siFastapi,
  siFigma,
  siFirebase,
  siFlask,
  siFlutter,
  siGit,
  siGithubactions,
  siGitlab,
  siGo,
  siGoogleads,
  siGoogleanalytics,
  siGooglecloud,
  siGooglesearchconsole,
  siGooglesheets,
  siGoogletranslate,
  siGrammarly,
  siGraphql,
  siHtml5,
  siIonic,
  siJavascript,
  siJenkins,
  siJest,
  siJira,
  siKotlin,
  siKubernetes,
  siLaravel,
  siLinux,
  siMailchimp,
  siMake,
  siMarkdown,
  siMedium,
  siMeta,
  siMiro,
  siMocha,
  siMongodb,
  siMysql,
  siNestjs,
  siNextdotjs,
  siNginx,
  siNodedotjs,
  siNotion,
  siNuxt,
  siOpencv,
  siOpenjdk,
  siPhp,
  siPostgresql,
  siPostman,
  siPython,
  siPytorch,
  siQuickbooks,
  siReact,
  siRedis,
  siRemix,
  siRuby,
  siRubyonrails,
  siRust,
  siSap,
  siScala,
  siSelenium,
  siShopify,
  siSolidity,
  siSpringboot,
  siSqlite,
  siSupabase,
  siSvelte,
  siSwift,
  siTailwindcss,
  siTensorflow,
  siTerraform,
  siThreedotjs,
  siTypescript,
  siUnity,
  siUnrealengine,
  siVuedotjs,
  siWeb3dotjs,
  siWebflow,
  siWordpress,
  siZendesk
} from "simple-icons";
import { iconifyLogos } from "../data/skillIconifyLogos.js";

const SIMPLE_ICONS = {
  siAngular,
  siAnsible,
  siApache,
  siAsana,
  siAstro,
  siBehance,
  siBlender,
  siBootstrap,
  siC,
  siChartdotjs,
  siClickup,
  siCloudflare,
  siCodeigniter,
  siCplusplus,
  siCss,
  siCypress,
  siDjango,
  siDocker,
  siDotnet,
  siElasticsearch,
  siElixir,
  siEthereum,
  siExpress,
  siFacebook,
  siFastapi,
  siFigma,
  siFirebase,
  siFlask,
  siFlutter,
  siGit,
  siGithubactions,
  siGitlab,
  siGo,
  siGoogleads,
  siGoogleanalytics,
  siGooglecloud,
  siGooglesearchconsole,
  siGooglesheets,
  siGoogletranslate,
  siGrammarly,
  siGraphql,
  siHtml5,
  siIonic,
  siJavascript,
  siJenkins,
  siJest,
  siJira,
  siKotlin,
  siKubernetes,
  siLaravel,
  siLinux,
  siMailchimp,
  siMake,
  siMarkdown,
  siMedium,
  siMeta,
  siMiro,
  siMocha,
  siMongodb,
  siMysql,
  siNestjs,
  siNextdotjs,
  siNginx,
  siNodedotjs,
  siNotion,
  siNuxt,
  siOpencv,
  siOpenjdk,
  siPhp,
  siPostgresql,
  siPostman,
  siPython,
  siPytorch,
  siQuickbooks,
  siReact,
  siRedis,
  siRemix,
  siRuby,
  siRubyonrails,
  siRust,
  siSap,
  siScala,
  siSelenium,
  siShopify,
  siSolidity,
  siSpringboot,
  siSqlite,
  siSupabase,
  siSvelte,
  siSwift,
  siTailwindcss,
  siTensorflow,
  siTerraform,
  siThreedotjs,
  siTypescript,
  siUnity,
  siUnrealengine,
  siVuedotjs,
  siWeb3dotjs,
  siWebflow,
  siWordpress,
  siZendesk
};

const SIMPLE_ICON_ALIASES = {
  "Vue": "Vue.js",
  "C#": ".NET",
  "HTML": "HTML5",
  "Express.js": "Express",
  "Nuxt.js": "Nuxt",
  "GCP": "Google Cloud",
  "React Native": "React",
  "ASP.NET": ".NET",
  "CI/CD": "GitHub Actions",
  "DevOps": "GitLab",
  "REST APIs": "Postman",
  "Microservices": "Docker",
  "UI/UX Design": "Figma",
  "Wireframing": "Miro",
  "Prototyping": "Miro",
  "User Research": "Miro",
  "Brand Design": "Behance",
  "3D Modeling": "Blender",
  "SEO": "Google Search Console",
  "Content Writing": "Medium",
  "Copywriting": "Grammarly",
  "Social Media": "Meta",
  "Facebook Ads": "Facebook",
  "Analytics": "Google Analytics",
  "Data Analysis": "Python",
  "Machine Learning": "TensorFlow",
  "Data Visualization": "Chart.js",
  "Cybersecurity": "Cloudflare",
  "QA Testing": "Selenium",
  "Automation Testing": "Selenium",
  "Manual Testing": "Selenium",
  "Product Management": "Jira",
  "Project Management": "Asana",
  "Scrum": "Jira",
  "Agile": "Jira",
  "Business Analysis": "Jira",
  "Accounting": "QuickBooks",
  "Excel": "Google Sheets",
  "Email Marketing": "Mailchimp",
  "Technical Writing": "Markdown",
  "Translation": "Google Translate",
  "Customer Support": "Zendesk",
  "Virtual Assistant": "Notion",
  "No-code": "Webflow",
  "Make (Integromat)": "Make",
  "Blockchain": "Ethereum",
  "Web3": "Web3.js"
};

const ICONIFY_ICON_ALIASES = {
  "AWS": "aws",
  "Azure": "azure",
  "Adobe XD": "adobe-xd",
  "After Effects": "adobe-after-effects",
  "Motion Design": "adobe-after-effects",
  "Premiere Pro": "adobe-premiere",
  "Video Editing": "adobe-premiere",
  "Illustration": "adobe-illustrator",
  "Tableau": "tableau",
  "Power BI": "microsoft-power-bi",
  "Magento": "magento",
  "Salesforce": "salesforce",
  "Bubble": "bubble",
  "Java": "java",
  "AI/LLM": "openai"
};

const TITLE_TO_SLUG_REPLACEMENTS = {
  "+": "plus",
  ".": "dot",
  "&": "and",
  "\u0111": "d",
  "\u0127": "h",
  "\u0131": "i",
  "\u0138": "k",
  "\u0140": "l",
  "\u0142": "l",
  "\u00df": "ss",
  "\u0167": "t",
  "\u00f8": "o"
};

const TITLE_TO_SLUG_CHARS_REGEX = new RegExp(
  `[${Object.keys(TITLE_TO_SLUG_REPLACEMENTS).join("")}]`,
  "g"
);

const TITLE_TO_SLUG_RANGE_REGEX = /[^a-z\d]/g;

const titleToSlug = (title) =>
  title
    .toLowerCase()
    .replaceAll(TITLE_TO_SLUG_CHARS_REGEX, (char) => TITLE_TO_SLUG_REPLACEMENTS[char])
    .normalize("NFD")
    .replaceAll(TITLE_TO_SLUG_RANGE_REGEX, "");

const slugToVariableName = (slug) =>
  `si${slug[0].toUpperCase()}${slug.slice(1)}`;

const hashSkill = (skill) => {
  let hash = 0;
  for (let i = 0; i < skill.length; i += 1) {
    hash = (hash * 31 + skill.charCodeAt(i)) % 360;
  }
  return hash;
};

const getInitials = (skill) => {
  const cleaned = skill.replace(/[^a-zA-Z0-9]+/g, " ").trim();
  if (!cleaned) return skill.slice(0, 2).toUpperCase();
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length === 1) {
    const word = parts[0];
    return (word.length <= 2 ? word : word.slice(0, 2)).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const resolveSimpleIcon = (skill) => {
  const label = SIMPLE_ICON_ALIASES[skill] || skill;
  const slug = titleToSlug(label);
  if (!slug) return null;
  const variableName = slugToVariableName(slug);
  return SIMPLE_ICONS[variableName] || null;
};

const resolveIconifyIcon = (skill) => {
  const iconKey = ICONIFY_ICON_ALIASES[skill];
  if (!iconKey) return null;
  const icon = iconifyLogos.icons?.[iconKey];
  if (!icon) return null;
  const width = icon.width || iconifyLogos.width || 24;
  const height = icon.height || iconifyLogos.height || 24;
  return { icon, width, height };
};

export default function SkillLogo({ skill, size = 22 }) {
  const iconify = resolveIconifyIcon(skill);
  const simple = iconify ? null : resolveSimpleIcon(skill);
  const iconSize = Math.max(12, Math.round(size * 0.62));

  if (iconify || simple) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full border border-white/30 bg-white/90 shadow"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {iconify ? (
          <svg
            width={iconSize}
            height={iconSize}
            viewBox={`0 0 ${iconify.width} ${iconify.height}`}
            xmlns="http://www.w3.org/2000/svg"
            focusable="false"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: iconify.icon.body }}
          />
        ) : (
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            focusable="false"
            aria-hidden="true"
          >
            <title>{simple.title}</title>
            <path d={simple.path} fill={`#${simple.hex}`} />
          </svg>
        )}
      </span>
    );
  }

  const hue = hashSkill(skill);
  const gradient = `linear-gradient(135deg, hsl(${hue} 72% 55%), hsl(${(hue + 35) % 360} 70% 45%))`;
  const initials = getInitials(skill);

  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-[10px] font-semibold uppercase text-white shadow"
      style={{
        width: size,
        height: size,
        backgroundImage: gradient
      }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
