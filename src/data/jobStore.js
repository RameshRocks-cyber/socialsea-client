import api from "../api/axios";
import baseJobs from "./jobs";

const STORAGE_KEY = "socialsea_company_jobs_v1";
const JOBS_CHANGED_EVENT = "socialsea-jobs-changed";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_JOB_DURATION_DAYS = 30;

const ensureString = (value) => String(value || "").trim();
const ensureNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};
const ensureDurationDays = (value) => {
  const num = Math.floor(ensureNumber(value));
  return num > 0 ? num : 0;
};

const splitList = (value) =>
  ensureString(value)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeStatus = (value) => {
  const raw = ensureString(value).toLowerCase();
  if (raw === "paused" || raw === "closed") return raw;
  return "open";
};

const dispatchJobsChanged = () => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(JOBS_CHANGED_EVENT));
  } catch {
    // ignore dispatch failures
  }
};

const normalizeJob = (job) => {
  const createdAt = ensureNumber(job?.createdAt) || Date.now();
  const rawExpiresAt = ensureNumber(job?.expiresAt);
  let durationDays = ensureDurationDays(job?.durationDays);
  if (!durationDays) {
    if (rawExpiresAt > 0 && rawExpiresAt > createdAt) {
      durationDays = Math.max(1, Math.ceil((rawExpiresAt - createdAt) / DAY_MS));
    } else {
      durationDays = DEFAULT_JOB_DURATION_DAYS;
    }
  }
  const expiresAt = rawExpiresAt > 0 ? rawExpiresAt : createdAt + durationDays * DAY_MS;
  return {
    id: ensureString(job?.id) || `company-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: ensureString(job?.title),
    companyId: ensureString(job?.companyId) || "company",
    companyName: ensureString(job?.companyName),
    location: ensureString(job?.location),
    salary: ensureString(job?.salary),
    experience: ensureString(job?.experience),
    track: ensureString(job?.track) || "General",
    skills: Array.isArray(job?.skills) ? job.skills : splitList(job?.skills),
    description: ensureString(job?.description),
    responsibilities: Array.isArray(job?.responsibilities) ? job.responsibilities : splitList(job?.responsibilities),
    requirements: Array.isArray(job?.requirements) ? job.requirements : splitList(job?.requirements),
    benefits: Array.isArray(job?.benefits) ? job.benefits : splitList(job?.benefits),
    applyUrl: ensureString(job?.applyUrl),
    ownerKey: ensureString(job?.ownerKey),
    ownerId: ensureString(job?.ownerId),
    ownerEmail: ensureString(job?.ownerEmail),
    status: normalizeStatus(job?.status),
    durationDays,
    expiresAt,
    createdAt,
    updatedAt: ensureNumber(job?.updatedAt) || createdAt
  };
};

const readStoredJobs = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeJob);
  } catch {
    return [];
  }
};

const writeStoredJobs = (jobs) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs || []));
  } catch {
    // ignore storage issues
  }
};

const parseServerJobs = (payload) => {
  const list = Array.isArray(payload) ? payload : Array.isArray(payload?.jobs) ? payload.jobs : [];
  return list.map(normalizeJob);
};

const mergeById = (jobs) => {
  const map = new Map();
  (Array.isArray(jobs) ? jobs : []).forEach((entry) => {
    const job = normalizeJob(entry);
    if (!job?.id) return;
    if (!map.has(job.id)) {
      map.set(job.id, job);
      return;
    }
    const prev = map.get(job.id);
    map.set(job.id, Number(job.updatedAt || 0) >= Number(prev?.updatedAt || 0) ? job : prev);
  });
  return Array.from(map.values()).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
};

export const getStoredJobs = () => readStoredJobs();
export const JOBS_CHANGED_EVENT_NAME = JOBS_CHANGED_EVENT;

export const isJobExpired = (job, now = Date.now()) => {
  const expiresAt = ensureNumber(job?.expiresAt);
  if (!expiresAt) return false;
  return expiresAt <= now;
};

export const getAllJobs = (options = {}) => {
  const includeExpired = Boolean(options?.includeExpired);
  const stored = readStoredJobs();
  const storedById = new Map(stored.map((job) => [job.id, job]));
  const merged = baseJobs.map((job) => storedById.get(job.id) || job);
  const extras = stored.filter((job) => !baseJobs.some((base) => base.id === job.id));
  return [...merged, ...extras].filter((job) => {
    if (normalizeStatus(job?.status) !== "open") return false;
    if (!includeExpired && isJobExpired(job)) return false;
    return true;
  });
};

export const syncJobsFromServer = async (options = {}) => {
  const includeExpired = Boolean(options?.includeExpired);
  const includeClosed = Boolean(options?.includeClosed);
  const mine = Boolean(options?.mine);
  const endpoint = mine ? "/api/jobs/mine" : "/api/jobs";
  try {
    const response = await api.get(endpoint, {
      params: {
        includeExpired,
        includeClosed
      },
      suppressAuthRedirect: true
    });
    const incoming = parseServerJobs(response?.data);
    if (mine) {
      const meId = ensureString(sessionStorage.getItem("userId") || localStorage.getItem("userId"));
      const existing = readStoredJobs();
      const others = meId ? existing.filter((job) => ensureString(job?.ownerId) !== meId) : existing;
      writeStoredJobs(mergeById([...incoming, ...others]));
    } else {
      writeStoredJobs(mergeById(incoming));
    }
    dispatchJobsChanged();
    return getStoredJobs();
  } catch {
    return getStoredJobs();
  }
};

export const addCompanyJob = async (payload) => {
  const stored = readStoredJobs();
  const draft = normalizeJob(payload);
  stored.unshift(draft);
  writeStoredJobs(mergeById(stored));
  dispatchJobsChanged();
  try {
    const response = await api.post("/api/jobs", draft, { suppressAuthRedirect: true });
    const saved = normalizeJob(response?.data || draft);
    const next = readStoredJobs().filter((item) => item.id !== draft.id);
    next.unshift(saved);
    writeStoredJobs(mergeById(next));
    dispatchJobsChanged();
    return saved;
  } catch {
    return draft;
  }
};

export const updateCompanyJob = async (jobId, payload) => {
  const id = ensureString(jobId);
  if (!id) return null;
  const stored = readStoredJobs();
  const index = stored.findIndex((job) => job.id === id);
  if (index < 0) return null;
  const existing = stored[index];
  const updated = normalizeJob({
    ...existing,
    ...payload,
    id: existing.id,
    createdAt: existing.createdAt
  });
  stored[index] = updated;
  writeStoredJobs(mergeById(stored));
  dispatchJobsChanged();
  try {
    const response = await api.put(`/api/jobs/${encodeURIComponent(id)}`, payload || {}, { suppressAuthRedirect: true });
    const saved = normalizeJob(response?.data || updated);
    const next = readStoredJobs().map((item) => (item.id === id ? saved : item));
    writeStoredJobs(mergeById(next));
    dispatchJobsChanged();
    return saved;
  } catch {
    return updated;
  }
};

export const removeCompanyJob = async (jobId) => {
  const id = ensureString(jobId);
  if (!id) return;
  const stored = readStoredJobs();
  const next = stored.filter((job) => job.id !== id);
  writeStoredJobs(mergeById(next));
  dispatchJobsChanged();
  try {
    await api.delete(`/api/jobs/${encodeURIComponent(id)}`, { suppressAuthRedirect: true });
  } catch {
    // keep local deletion if backend is unreachable
  }
};

export const getJobsByCompanyId = (companyId) => {
  const id = ensureString(companyId);
  if (!id) return [];
  return getAllJobs().filter((job) => String(job.companyId) === id);
};

export const getJobsByOwner = (ownerKey, options = {}) => {
  const includeExpired = Boolean(options?.includeExpired);
  const key = ensureString(ownerKey);
  if (!key) return [];
  return readStoredJobs().filter((job) => {
    if (job.ownerKey !== key) return false;
    if (!includeExpired && isJobExpired(job)) return false;
    return true;
  });
};
