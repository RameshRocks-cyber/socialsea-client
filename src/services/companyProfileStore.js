const PROFILE_KEY = "socialsea_company_profile_v1";

const ensureString = (value) => String(value || "").trim();

const splitList = (value) =>
  ensureString(value)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => ensureString(item)).filter(Boolean);
  }
  return splitList(value);
};

const buildCompanyId = (name) => {
  const base = ensureString(name).toLowerCase();
  const cleaned = base.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return cleaned;
};

const emptyProfile = () => ({
  companyId: "",
  name: "",
  logoUrl: "",
  industry: "",
  location: "",
  size: "",
  stage: "",
  overview: "",
  whatWeDo: "",
  features: [],
  clients: [],
  services: [],
  website: "",
  contactEmail: ""
});

const normalizeProfile = (raw) => {
  const profile = raw && typeof raw === "object" ? raw : {};
  const name = ensureString(profile.name);
  const companyId = ensureString(profile.companyId) || buildCompanyId(name);
  return {
    companyId,
    name,
    logoUrl: ensureString(profile.logoUrl),
    industry: ensureString(profile.industry),
    location: ensureString(profile.location),
    size: ensureString(profile.size),
    stage: ensureString(profile.stage),
    overview: ensureString(profile.overview),
    whatWeDo: ensureString(profile.whatWeDo),
    features: normalizeList(profile.features),
    clients: normalizeList(profile.clients),
    services: normalizeList(profile.services),
    website: ensureString(profile.website),
    contactEmail: ensureString(profile.contactEmail)
  };
};

const readCompanyProfile = () => {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return emptyProfile();
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return emptyProfile();
  }
};

const writeCompanyProfile = (profile) => {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(normalizeProfile(profile)));
  } catch {
    // ignore storage errors
  }
};

export {
  buildCompanyId,
  readCompanyProfile,
  writeCompanyProfile,
  emptyProfile,
  normalizeProfile
};
