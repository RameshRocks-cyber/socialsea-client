import api from "../api/axios";
import { clearAuthStorage } from "../auth";

const RESUME_STORAGE_KEY = "socialsea_resume_snapshot_v1";

const DEFAULT_RESUME = {
  personal: {
    fullName: "",
    title: "",
    email: "",
    phone: "",
    location: "",
    website: "",
    avatar: "",
  },
  objective: "",
  education: [
    {
      degree: "",
      school: "",
      start: "",
      end: "",
      details: "",
    },
  ],
  experience: [
    {
      role: "",
      company: "",
      start: "",
      end: "",
      details: "",
    },
  ],
  skills: "",
  projects: [
    {
      name: "",
      description: "",
      media: "",
    },
  ],
  achievements: "",
  references: "",
  coverLetter: "",
  declaration: "",
  customSections: [],
};

const cloneDefault = () => JSON.parse(JSON.stringify(DEFAULT_RESUME));

const isPlainObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value);

const ensureString = (value) => (typeof value === "string" ? value : "");

const normalizeList = (value, template) => {
  if (!Array.isArray(value) || value.length === 0) {
    return [JSON.parse(JSON.stringify(template))];
  }
  return value.map((item) => ({
    ...JSON.parse(JSON.stringify(template)),
    ...(isPlainObject(item) ? item : {}),
  }));
};

const normalizeResume = (value) => {
  const base = cloneDefault();
  const safe = isPlainObject(value) ? value : {};
  const personal = {
    ...base.personal,
    ...(isPlainObject(safe.personal) ? safe.personal : {}),
  };
  personal.avatar = ensureString(personal.avatar);

  return {
    ...base,
    ...safe,
    personal,
    objective: ensureString(safe.objective),
    skills: ensureString(safe.skills),
    achievements: ensureString(safe.achievements),
    references: ensureString(safe.references),
    coverLetter: ensureString(safe.coverLetter),
    declaration: ensureString(safe.declaration),
    education: normalizeList(safe.education, base.education[0]),
    experience: normalizeList(safe.experience, base.experience[0]),
    projects: normalizeList(safe.projects, base.projects[0]).map((item) => ({
      ...item,
      media: ensureString(item.media),
    })),
    customSections: Array.isArray(safe.customSections)
      ? safe.customSections.map((item) => ({
          title: ensureString(item?.title),
          content: ensureString(item?.content),
        }))
      : [],
  };
};

const readLocalResume = () => {
  try {
    const raw = localStorage.getItem(RESUME_STORAGE_KEY);
    if (!raw) return null;
    return normalizeResume(JSON.parse(raw));
  } catch {
    return null;
  }
};

const writeLocalResume = (value) => {
  try {
    localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
};

export const getDefaultResume = () => cloneDefault();

export const loadResume = async () => {
  const cached = readLocalResume();
  try {
    const res = await api.get("/api/resume/me", { suppressAuthRedirect: true });
    const normalized = normalizeResume(res?.data || {});
    writeLocalResume(normalized);
    return normalized;
  } catch (error) {
    if (error?.response?.status === 401) {
      clearAuthStorage();
    }
    return cached || cloneDefault();
  }
};

export const saveResume = async (data) => {
  try {
    const normalized = normalizeResume(data);
    writeLocalResume(normalized);
    await api.put("/api/resume/me", normalized, {
      suppressAuthRedirect: true,
    });
  } catch (error) {
    if (error?.response?.status === 401) {
      clearAuthStorage();
    }
  }
};

export const readResumeSnapshot = () => readLocalResume() || cloneDefault();
