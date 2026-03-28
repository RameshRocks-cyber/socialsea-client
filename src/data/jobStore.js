import baseJobs from "./jobs";

const STORAGE_KEY = "socialsea_company_jobs_v1";
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
  const normalized = {
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
    responsibilities: Array.isArray(job?.responsibilities)
      ? job.responsibilities
      : splitList(job?.responsibilities),
    requirements: Array.isArray(job?.requirements) ? job.requirements : splitList(job?.requirements),
    benefits: Array.isArray(job?.benefits) ? job.benefits : splitList(job?.benefits),
    applyUrl: ensureString(job?.applyUrl),
    ownerKey: ensureString(job?.ownerKey),
    status: normalizeStatus(job?.status),
    durationDays,
    expiresAt,
    createdAt,
    updatedAt: ensureNumber(job?.updatedAt) || createdAt
  };

  return normalized;
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

export const getStoredJobs = () => readStoredJobs();

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

export const addCompanyJob = (payload) => {
  const stored = readStoredJobs();
  const job = normalizeJob(payload);
  stored.unshift(job);
  writeStoredJobs(stored);
  return job;
};

export const updateCompanyJob = (jobId, payload) => {
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
  writeStoredJobs(stored);
  return updated;
};

export const removeCompanyJob = (jobId) => {
  const id = ensureString(jobId);
  if (!id) return;
  const stored = readStoredJobs();
  const next = stored.filter((job) => job.id !== id);
  writeStoredJobs(next);
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
