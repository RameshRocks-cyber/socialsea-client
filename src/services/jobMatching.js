const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "you",
  "your",
  "our",
  "we",
  "will",
  "work",
  "working",
  "role",
  "team",
  "good",
  "strong",
  "skills",
  "skill",
  "knowledge",
  "using",
  "ability",
  "years",
  "year",
  "yrs",
  "plus",
  "must",
  "have",
  "has",
  "had",
  "need",
  "needs",
  "needed",
  "required",
  "requirement",
  "requirements",
  "preferred",
  "experience",
  "developer",
  "engineer",
  "job",
  "position",
  "candidate"
]);

const SHORT_TOKENS = new Set([
  "ai",
  "ml",
  "ui",
  "ux",
  "qa",
  "hr",
  "go",
  "it"
]);

const SECTION_LABELS = {
  personal: "personal details",
  objective: "summary",
  skills: "skills",
  experience: "experience",
  projects: "projects",
  education: "education",
  achievements: "achievements",
  reference: "references",
  coverLetter: "cover letter",
  declaration: "declaration"
};

const SECTION_TARGETS = {
  personal: "personal",
  objective: "objective",
  skills: "skills",
  experience: "experience",
  projects: "projects",
  education: "education",
  achievements: "achievements",
  reference: "reference",
  coverLetter: "coverLetter",
  declaration: "declaration"
};

const ensureString = (value) => String(value || "").trim();

const isFilled = (value) => ensureString(value).length > 0;

const hasEntry = (entry) =>
  Object.values(entry || {}).some((value) => isFilled(value));

const uniqueList = (list) => Array.from(new Set((list || []).filter(Boolean)));

const splitList = (value) =>
  ensureString(value)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeText = (value) =>
  ensureString(value)
    .toLowerCase()
    .replace(/\bc\+\+\b/g, " cplusplus ")
    .replace(/\bc#\b/g, " csharp ")
    .replace(/\bnode\s*\.?\s*js\b/g, " nodejs ")
    .replace(/\breact\s*\.?\s*js\b/g, " reactjs ")
    .replace(/\bnext\s*\.?\s*js\b/g, " nextjs ")
    .replace(/\bvue\s*\.?\s*js\b/g, " vuejs ")
    .replace(/\bexpress\s*\.?\s*js\b/g, " expressjs ")
    .replace(/\basp\s*\.?\s*net\b/g, " aspnet ")
    .replace(/\b\.net\b/g, " dotnet ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (value) =>
  normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => {
      if (!token) return false;
      if (SHORT_TOKENS.has(token)) return true;
      if (token.length < 3) return false;
      return !STOP_WORDS.has(token);
    });

const normalizeSkill = (value) => normalizeText(value);

const joinEntryValues = (entry, fields) =>
  fields.map((field) => ensureString(entry?.[field])).filter(Boolean).join(" ");

const countFilledFields = (obj) =>
  Object.values(obj || {}).filter((value) => isFilled(value)).length;

const extractYear = (value, fallback) => {
  const text = ensureString(value);
  const match = text.match(/(19|20)\d{2}/);
  if (match) return Number(match[0]);
  return fallback;
};

const estimateExperienceYears = (experienceList) => {
  const entries = Array.isArray(experienceList) ? experienceList.filter(hasEntry) : [];
  if (!entries.length) return 0;

  let total = 0;
  entries.forEach((item) => {
    const start = extractYear(item?.start, 0);
    const end = extractYear(item?.end, new Date().getFullYear());
    if (start > 0 && end >= start) {
      total += Math.max(1, end - start + 1);
      return;
    }
    total += 1;
  });

  return Math.min(total, 20);
};

const parseRequiredYears = (value) => {
  const text = ensureString(value).toLowerCase();
  if (!text) return 0;
  if (/(fresher|entry level|intern|internship|no experience)/i.test(text)) {
    return 0;
  }

  const rangeMatch = text.match(/(\d+)\s*[-to]+\s*(\d+)\s*(?:years?|yrs?)/i);
  if (rangeMatch) {
    return Number(rangeMatch[1]) || 0;
  }

  const singleMatch = text.match(/(\d+)\s*\+?\s*(?:years?|yrs?)/i);
  if (singleMatch) {
    return Number(singleMatch[1]) || 0;
  }

  return 0;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const computeResumeCompleteness = (resume) => {
  const personal = resume?.personal || {};
  const sections = [
    {
      key: "personal",
      ratio: countFilledFields(personal) / 7,
      weight: 0.18
    },
    {
      key: "objective",
      ratio: isFilled(resume?.objective) ? 1 : 0,
      weight: 0.1
    },
    {
      key: "skills",
      ratio: splitList(resume?.skills).length > 0 ? 1 : 0,
      weight: 0.24
    },
    {
      key: "experience",
      ratio: (resume?.experience || []).filter(hasEntry).length > 0 ? 1 : 0,
      weight: 0.16
    },
    {
      key: "projects",
      ratio: (resume?.projects || []).filter(hasEntry).length > 0 ? 1 : 0,
      weight: 0.14
    },
    {
      key: "education",
      ratio: (resume?.education || []).filter(hasEntry).length > 0 ? 1 : 0,
      weight: 0.08
    },
    {
      key: "achievements",
      ratio: isFilled(resume?.achievements) ? 1 : 0,
      weight: 0.04
    },
    {
      key: "reference",
      ratio: isFilled(resume?.references) ? 1 : 0,
      weight: 0.02
    },
    {
      key: "coverLetter",
      ratio: isFilled(resume?.coverLetter) ? 1 : 0,
      weight: 0.02
    },
    {
      key: "declaration",
      ratio: isFilled(resume?.declaration) ? 1 : 0,
      weight: 0.02
    }
  ];

  const score = Math.round(
    sections.reduce((sum, section) => sum + section.ratio * section.weight * 100, 0)
  );
  const missingSections = sections
    .filter((section) => section.ratio < 0.5)
    .map((section) => ({
      key: section.key,
      label: SECTION_LABELS[section.key] || section.key,
      target: SECTION_TARGETS[section.key] || ""
    }));

  return {
    score: clamp(score, 0, 100),
    missingSections
  };
};

export const buildResumeMatchProfile = (resume) => {
  const safeResume = resume || {};
  const directSkills = uniqueList(splitList(safeResume.skills).map(normalizeSkill));
  const experience = Array.isArray(safeResume.experience)
    ? safeResume.experience.filter(hasEntry)
    : [];
  const projects = Array.isArray(safeResume.projects)
    ? safeResume.projects.filter(hasEntry)
    : [];
  const education = Array.isArray(safeResume.education)
    ? safeResume.education.filter(hasEntry)
    : [];
  const customSections = Array.isArray(safeResume.customSections)
    ? safeResume.customSections.filter(
        (section) => isFilled(section?.title) || isFilled(section?.content)
      )
    : [];

  const textBlocks = [
    ensureString(safeResume.personal?.fullName),
    ensureString(safeResume.personal?.title),
    ensureString(safeResume.personal?.email),
    ensureString(safeResume.personal?.location),
    ensureString(safeResume.objective),
    ensureString(safeResume.skills),
    ensureString(safeResume.achievements),
    ensureString(safeResume.references),
    ensureString(safeResume.coverLetter),
    ensureString(safeResume.declaration),
    ...experience.map((item) => joinEntryValues(item, ["role", "company", "details"])),
    ...projects.map((item) => joinEntryValues(item, ["name", "description"])),
    ...education.map((item) => joinEntryValues(item, ["degree", "school", "details"])),
    ...customSections.map((item) => joinEntryValues(item, ["title", "content"]))
  ].filter(Boolean);

  const normalizedText = normalizeText(textBlocks.join(" "));
  const tokenSet = new Set(tokenize(normalizedText));
  const projectText = normalizeText(
    projects.map((item) => joinEntryValues(item, ["name", "description"])).join(" ")
  );
  const completeness = computeResumeCompleteness(safeResume);

  return {
    resume: safeResume,
    directSkills,
    directSkillSet: new Set(directSkills),
    normalizedText,
    tokenSet,
    projectText,
    experienceYears: estimateExperienceYears(experience),
    experienceCount: experience.length,
    projectCount: projects.length,
    completeness
  };
};

const collectJobSkills = (job) => {
  const explicit = Array.isArray(job?.skills) ? job.skills : splitList(job?.skills);
  const normalized = uniqueList(explicit.map(normalizeSkill));
  if (normalized.length > 0) {
    return normalized;
  }

  return uniqueList([
    ...tokenize(job?.title),
    ...tokenize(job?.track)
  ]);
};

const collectJobKeywords = (job) =>
  uniqueList([
    ...tokenize(job?.title),
    ...tokenize(job?.track),
    ...tokenize(job?.description),
    ...tokenize(Array.isArray(job?.requirements) ? job.requirements.join(" ") : job?.requirements),
    ...tokenize(
      Array.isArray(job?.responsibilities)
        ? job.responsibilities.join(" ")
        : job?.responsibilities
    )
  ]).slice(0, 18);

const resumeMatchesPhrase = (profile, phrase) => {
  const normalizedPhrase = normalizeSkill(phrase);
  if (!normalizedPhrase) return false;
  if (profile.directSkillSet.has(normalizedPhrase)) return true;

  const tokens = tokenize(normalizedPhrase);
  if (!tokens.length) {
    return profile.normalizedText.includes(normalizedPhrase);
  }

  const containsAllTokens = tokens.every((token) => profile.tokenSet.has(token));
  if (containsAllTokens) return true;

  return profile.normalizedText.includes(normalizedPhrase);
};

const projectMatchesPhrase = (profile, phrase) => {
  const normalizedPhrase = normalizeSkill(phrase);
  if (!normalizedPhrase || !profile.projectText) return false;
  if (profile.projectText.includes(normalizedPhrase)) return true;
  return tokenize(normalizedPhrase).every((token) => profile.projectText.includes(token));
};

const buildReasonList = (matchedSkills, keywordHits, completenessScore, missingSkills) => {
  const reasons = [];

  if (matchedSkills.length > 0) {
    reasons.push(`Matched skills: ${matchedSkills.slice(0, 3).join(", ")}`);
  }

  if (keywordHits.length > 0) {
    reasons.push(`Resume signals line up with ${keywordHits.slice(0, 3).join(", ")}`);
  }

  if (completenessScore >= 70) {
    reasons.push("Your resume profile is well filled out");
  }

  if (missingSkills.length > 0) {
    reasons.push(`Add ${missingSkills.slice(0, 3).join(", ")} to improve fit`);
  }

  return reasons.slice(0, 3);
};

export const scoreJobForResume = (job, resumeOrProfile) => {
  const profile =
    resumeOrProfile && resumeOrProfile.tokenSet instanceof Set
      ? resumeOrProfile
      : buildResumeMatchProfile(resumeOrProfile);

  const jobSkills = collectJobSkills(job);
  const jobKeywords = collectJobKeywords(job);
  const matchedSkills = jobSkills.filter((skill) => resumeMatchesPhrase(profile, skill));
  const missingSkills = jobSkills.filter((skill) => !matchedSkills.includes(skill));
  const keywordHits = jobKeywords.filter((keyword) => profile.tokenSet.has(keyword));

  const skillRatio = jobSkills.length
    ? matchedSkills.length / jobSkills.length
    : jobKeywords.length
      ? keywordHits.length / jobKeywords.length
      : 0;

  const keywordRatio = jobKeywords.length ? keywordHits.length / jobKeywords.length : skillRatio;

  const matchedProjectSkills = jobSkills.filter((skill) => projectMatchesPhrase(profile, skill));
  const projectRatio = profile.projectCount
    ? jobSkills.length
      ? matchedProjectSkills.length / jobSkills.length
      : Math.min(profile.projectCount / 3, 1)
    : 0;

  const requiredYears = parseRequiredYears(job?.experience);
  const experienceRatio = requiredYears > 0
    ? clamp(profile.experienceYears / requiredYears, 0, 1)
    : profile.experienceCount > 0
      ? 1
      : profile.projectCount > 0
        ? 0.55
        : 0;

  const completenessRatio = profile.completeness.score / 100;
  let matchRatio =
    skillRatio * 0.62 +
    keywordRatio * 0.12 +
    projectRatio * 0.11 +
    experienceRatio * 0.1 +
    completenessRatio * 0.05;

  if (jobSkills.length > 0 && matchedSkills.length === 0) {
    matchRatio = Math.min(matchRatio, 0.34);
  }

  const missingPenalty = missingSkills.length >= 4 ? 0.06 : missingSkills.length >= 2 ? 0.03 : 0;
  const chanceRatio = clamp(
    matchRatio * 0.65 +
      completenessRatio * 0.2 +
      experienceRatio * 0.1 +
      projectRatio * 0.05 -
      missingPenalty,
    0,
    0.96
  );

  const matchPercentage = clamp(Math.round(matchRatio * 100), 0, 99);
  const chancePercentage = clamp(Math.round(chanceRatio * 100), 0, 96);

  return {
    job,
    matchPercentage,
    chancePercentage,
    resumeStrengthPercentage: profile.completeness.score,
    matchedSkills,
    missingSkills,
    keywordHits,
    reasons: buildReasonList(
      matchedSkills,
      keywordHits,
      profile.completeness.score,
      missingSkills
    ),
    missingSections: profile.completeness.missingSections,
    requiredSkillCount: jobSkills.length,
    matchedSkillCount: matchedSkills.length
  };
};

export const rankJobsForResume = (jobs, resume) => {
  const profile = buildResumeMatchProfile(resume);
  return (Array.isArray(jobs) ? jobs : [])
    .map((job) => scoreJobForResume(job, profile))
    .sort((a, b) => {
      if (b.matchPercentage !== a.matchPercentage) {
        return b.matchPercentage - a.matchPercentage;
      }
      if (b.chancePercentage !== a.chancePercentage) {
        return b.chancePercentage - a.chancePercentage;
      }
      return Number(b?.job?.createdAt || 0) - Number(a?.job?.createdAt || 0);
    });
};
