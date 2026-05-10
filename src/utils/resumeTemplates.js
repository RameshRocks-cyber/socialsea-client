export const DEFAULT_RESUME_TEMPLATE = "modern-professional";

export const RESUME_TEMPLATE_OPTIONS = [
  {
    id: "modern-professional",
    name: "Modern Professional",
    tagline: "Corporate, clean, and structured",
    renderAs: "sidebar",
  },
  {
    id: "creative-designer",
    name: "Creative Designer",
    tagline: "Vibrant layout for design portfolios",
    renderAs: "sidebar",
  },
  {
    id: "minimal-ats",
    name: "Minimal ATS-Friendly",
    tagline: "Simple scan-ready black & white",
    renderAs: "graphite",
  },
  {
    id: "developer-resume",
    name: "Developer Resume",
    tagline: "Tech-heavy sections with skill focus",
    renderAs: "sidebar",
  },
  {
    id: "student-fresher",
    name: "Student / Fresher Resume",
    tagline: "Early-career friendly structure",
    renderAs: "sidebar",
  },
  {
    id: "elegant-classic",
    name: "Elegant Classic",
    tagline: "Refined serif look for formal roles",
    renderAs: "classic",
  },
  {
    id: "infographic-resume",
    name: "Infographic Resume",
    tagline: "Visual highlights and modern metrics",
    renderAs: "sidebar",
  },
  {
    id: "modern-two-column",
    name: "Modern Two Column",
    tagline: "Balanced two-column presentation",
    renderAs: "classic",
  },
];

const LEGACY_TEMPLATE_MAP = {
  classic: "elegant-classic",
  sidebar: "modern-professional",
  graphite: "minimal-ats",
  executive: "elegant-classic",
  studio: "creative-designer",
  minimal: "minimal-ats",
};

const TEMPLATE_ID_SET = new Set(
  RESUME_TEMPLATE_OPTIONS.map((template) => template.id)
);

const TEMPLATE_BY_ID = new Map(
  RESUME_TEMPLATE_OPTIONS.map((template) => [template.id, template])
);

export const normalizeResumeTemplate = (value) => {
  const candidate = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (TEMPLATE_ID_SET.has(candidate)) return candidate;
  const legacyMapped = LEGACY_TEMPLATE_MAP[candidate];
  if (legacyMapped) return legacyMapped;
  return DEFAULT_RESUME_TEMPLATE;
};

export const getResumeTemplate = (value) =>
  TEMPLATE_BY_ID.get(normalizeResumeTemplate(value));

export const getResumeRenderTemplate = (value) =>
  getResumeTemplate(value)?.renderAs || "sidebar";
