import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiSearch,
  FiLayers,
  FiFileText,
  FiEdit3,
  FiImage,
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiMic,
  FiMicOff,
  FiSend,
  FiUpload,
  FiZap,
  FiBookOpen,
  FiMusic,
  FiCalendar,
  FiMessageSquare
} from "react-icons/fi";
import { FaGraduationCap } from "react-icons/fa";
import api from "../api/axios";
import "./StudyMode.css";

const SUBJECT_ITEM_HEIGHT = 44;
const SUBJECT_PICKER_PADDING = 6;
const STUDY_SUBJECTS = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "English",
  "History",
  "Geography",
  "Computer Science",
  "Economics",
  "Accounting",
  "Business",
  "Psychology",
  "Sociology",
  "Political Science",
  "Civics",
  "Environmental Science",
  "Art",
  "Music",
  "Physical Education",
  "Languages"
];
const SUBJECT_GROUPS = {
  Mathematics: "math",
  Physics: "science",
  Chemistry: "science",
  Biology: "science",
  "Environmental Science": "science",
  "Computer Science": "computing",
  Economics: "economics",
  Accounting: "business",
  Business: "business",
  Psychology: "social",
  Sociology: "social",
  "Political Science": "social",
  Civics: "social",
  Geography: "social",
  History: "humanities",
  English: "humanities",
  Art: "humanities",
  Music: "humanities",
  Languages: "humanities",
  "Physical Education": "health"
};

const SUBJECT_SYNONYMS = {
  Mathematics: ["math", "maths", "mathematics"],
  Physics: ["physics", "physic"],
  Chemistry: ["chemistry", "chem"],
  Biology: ["biology", "bio"],
  English: ["english", "grammar", "literature", "writing"],
  History: ["history", "historical"],
  Geography: ["geography", "geo", "maps"],
  "Computer Science": ["computer science", "computing", "programming", "cs"],
  Economics: ["economics", "economy", "microeconomics", "macroeconomics"],
  Accounting: ["accounting", "accounts"],
  Business: ["business", "management"],
  Psychology: ["psychology", "psych"],
  Sociology: ["sociology", "social science"],
  "Political Science": ["political science", "politics", "government"],
  Civics: ["civics", "citizenship"],
  "Environmental Science": ["environment", "environmental science", "ecology"],
  Art: ["art", "drawing", "painting", "design"],
  Music: ["music", "musical"],
  "Physical Education": ["physical education", "fitness", "sports", "health"],
  Languages: ["language", "languages", "foreign language"]
};

const TOPIC_INDEX = [
  {
    topic: "algebra",
    subject: "Mathematics",
    synonyms: ["algabra", "aljebra", "algebraic", "linear equations", "quadratic equations", "polynomials"]
  },
  {
    topic: "geometry",
    subject: "Mathematics",
    synonyms: ["geomtry", "geoemtry", "angles", "triangles", "circles"]
  },
  {
    topic: "trigonometry",
    subject: "Mathematics",
    synonyms: ["trig", "sine", "cosine", "tangent"]
  },
  {
    topic: "calculus",
    subject: "Mathematics",
    synonyms: ["calculas", "derivatives", "integrals", "limits"]
  },
  {
    topic: "statistics",
    subject: "Mathematics",
    synonyms: ["stats", "probability", "mean", "median"]
  },
  {
    topic: "mechanics",
    subject: "Physics",
    synonyms: ["kinematics", "dynamics", "motion", "forces"]
  },
  {
    topic: "electricity",
    subject: "Physics",
    synonyms: ["circuits", "current", "voltage", "electromagnetism"]
  },
  {
    topic: "thermodynamics",
    subject: "Physics",
    synonyms: ["heat", "temperature", "energy transfer"]
  },
  {
    topic: "atoms",
    subject: "Chemistry",
    synonyms: ["atomic structure", "elements", "periodic table"]
  },
  {
    topic: "chemical bonding",
    subject: "Chemistry",
    synonyms: ["bonding", "ionic", "covalent"]
  },
  {
    topic: "stoichiometry",
    subject: "Chemistry",
    synonyms: ["stoichiometric", "moles", "balancing equations"]
  },
  {
    topic: "cells",
    subject: "Biology",
    synonyms: ["cell structure", "organelles"]
  },
  {
    topic: "genetics",
    subject: "Biology",
    synonyms: ["dna", "genes", "heredity"]
  },
  {
    topic: "photosynthesis",
    subject: "Biology",
    synonyms: ["plant energy", "chlorophyll"]
  },
  {
    topic: "grammar",
    subject: "English",
    synonyms: ["parts of speech", "sentence structure"]
  },
  {
    topic: "essay writing",
    subject: "English",
    synonyms: ["paragraph", "composition", "writing skills"]
  },
  {
    topic: "world history",
    subject: "History",
    synonyms: ["ancient history", "modern history", "world war"]
  },
  {
    topic: "map skills",
    subject: "Geography",
    synonyms: ["maps", "coordinates", "latitude", "longitude"]
  },
  {
    topic: "programming",
    subject: "Computer Science",
    synonyms: ["coding", "software", "development"]
  },
  {
    topic: "algorithms",
    subject: "Computer Science",
    synonyms: ["data structures", "complexity", "logic"]
  },
  {
    topic: "supply and demand",
    subject: "Economics",
    synonyms: ["market", "price", "elasticity"]
  }
];

const TOPIC_TO_SUBJECT = {};
const TOPIC_SYNONYM_MAP = {};
const SUBJECT_TOPIC_TAGS = {};
const TOPIC_TERMS = new Set();

TOPIC_INDEX.forEach(({ topic, subject, synonyms }) => {
  TOPIC_TO_SUBJECT[topic] = subject;
  TOPIC_SYNONYM_MAP[topic] = topic;
  TOPIC_TERMS.add(topic);
  if (!SUBJECT_TOPIC_TAGS[subject]) SUBJECT_TOPIC_TAGS[subject] = new Set();
  SUBJECT_TOPIC_TAGS[subject].add(topic);
  synonyms.forEach((synonym) => {
    TOPIC_SYNONYM_MAP[synonym] = topic;
    TOPIC_TERMS.add(synonym);
    SUBJECT_TOPIC_TAGS[subject].add(synonym);
  });
});

const SUBJECT_TOPIC_WORDS = Object.fromEntries(
  Object.entries(SUBJECT_TOPIC_TAGS).map(([subject, set]) => [subject, Array.from(set)])
);

const SPELLING_WORDS = Array.from(
  new Set([
    ...STUDY_SUBJECTS.map((subject) => subject.toLowerCase()),
    ...Object.values(SUBJECT_SYNONYMS).flat(),
    ...Array.from(TOPIC_TERMS)
  ])
).filter((term) => !term.includes(" "));
const SPELLING_WORD_SET = new Set(SPELLING_WORDS);

const RESOURCE_PROVIDERS = {
  openstax: {
    provider: "OpenStax",
    license: "CC BY 4.0",
    urlByGroup: {
      math: "https://openstax.org/subjects/math",
      science: "https://openstax.org/subjects/science",
      social: "https://openstax.org/subjects/social-sciences",
      business: "https://openstax.org/subjects/business",
      default: "https://openstax.org/subjects/"
    }
  },
  ocw: {
    provider: "MIT OpenCourseWare",
    license: "CC BY-NC-SA 4.0",
    urlByGroup: {
      math: "https://ocw.mit.edu/courses/mathematics/",
      science: "https://ocw.mit.edu/courses/physics/",
      computing: "https://ocw.mit.edu/courses/electrical-engineering-and-computer-science/",
      economics: "https://ocw.mit.edu/courses/economics/",
      default: "https://ocw.mit.edu/"
    }
  },
  khan: {
    provider: "Khan Academy",
    license: "CC BY-NC-SA (videos/exercises)",
    urlByGroup: {
      math: "https://www.khanacademy.org/math",
      science: "https://www.khanacademy.org/science",
      computing: "https://www.khanacademy.org/computing",
      economics: "https://www.khanacademy.org/economics-finance-domain",
      humanities: "https://www.khanacademy.org/humanities",
      health: "https://www.khanacademy.org/science/health-and-medicine",
      default: "https://www.khanacademy.org/"
    }
  },
  ck12: {
    provider: "CK-12 Foundation",
    license: "CK-12 Curriculum License",
    urlByGroup: {
      math: "https://www.ck12.org/",
      science: "https://www.ck12.org/",
      default: "https://www.ck12.org/"
    }
  }
};

const normalizeText = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toTitleCase = (value) =>
  value
    .split(" ")
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : ""))
    .join(" ");

const levenshtein = (value, target) => {
  if (value === target) return 0;
  const valueLength = value.length;
  const targetLength = target.length;
  if (!valueLength) return targetLength;
  if (!targetLength) return valueLength;
  const matrix = Array.from({ length: valueLength + 1 }, () => Array(targetLength + 1).fill(0));
  for (let i = 0; i <= valueLength; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= targetLength; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= valueLength; i += 1) {
    for (let j = 1; j <= targetLength; j += 1) {
      const cost = value[i - 1] === target[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[valueLength][targetLength];
};

const findClosestTerm = (term, vocabulary) => {
  let bestMatch = null;
  let bestDistance = Infinity;
  vocabulary.forEach((candidate) => {
    if (!candidate) return;
    const distance = levenshtein(term, candidate);
    if (distance < bestDistance) {
      bestMatch = candidate;
      bestDistance = distance;
    }
  });
  return { bestMatch, bestDistance };
};

const detectTopic = (normalized) => {
  let matchedTopic = null;
  let matchedLength = 0;
  Object.entries(TOPIC_SYNONYM_MAP).forEach(([synonym, topic]) => {
    if (!synonym) return;
    if (normalized.includes(synonym) && synonym.length > matchedLength) {
      matchedTopic = topic;
      matchedLength = synonym.length;
    }
  });
  return matchedTopic;
};

const detectSubject = (normalized) => {
  let matchedSubject = null;
  let matchedLength = 0;
  Object.entries(SUBJECT_SYNONYMS).forEach(([subject, synonyms]) => {
    synonyms.forEach((synonym) => {
      if (normalized.includes(synonym) && synonym.length > matchedLength) {
        matchedSubject = subject;
        matchedLength = synonym.length;
      }
    });
  });
  return matchedSubject;
};

const correctQueryText = (normalized) => {
  if (!normalized) return "";
  const words = normalized.split(" ").map((token) => {
    if (token.length < 4) return token;
    const canonicalTopic = TOPIC_SYNONYM_MAP[token];
    if (canonicalTopic && canonicalTopic !== token) return canonicalTopic;
    if (SPELLING_WORD_SET.has(token)) return token;
    const { bestMatch, bestDistance } = findClosestTerm(token, SPELLING_WORDS);
    const threshold = token.length <= 5 ? 1 : token.length <= 8 ? 2 : 3;
    if (bestMatch && bestDistance <= threshold) return bestMatch;
    return token;
  });
  return words.join(" ");
};

const resolveSearchMeta = (rawQuery) => {
  const normalized = normalizeText(rawQuery);
  if (!normalized) {
    return {
      raw: rawQuery,
      normalized: "",
      corrected: "",
      topic: null,
      subject: null,
      didCorrect: false
    };
  }
  const directTopic = detectTopic(normalized);
  const corrected = correctQueryText(normalized);
  const correctedTopic = directTopic || detectTopic(corrected);
  const subjectFromTopic = correctedTopic ? TOPIC_TO_SUBJECT[correctedTopic] : null;
  const subjectFromQuery = detectSubject(normalized) || detectSubject(corrected);
  const subject = subjectFromTopic || subjectFromQuery;
  const didCorrect = corrected && corrected !== normalized;
  return {
    raw: rawQuery,
    normalized,
    corrected,
    topic: correctedTopic,
    subject,
    didCorrect
  };
};

const buildStudyResources = (subject, topic) => {
  const group = SUBJECT_GROUPS[subject] || "default";
  const subjectTopics = SUBJECT_TOPIC_WORDS[subject] || [];
  const topicLabel = topic ? `${toTitleCase(topic)} ` : `${subject} `;
  const makeResource = (label, providerKey) => {
    const provider = RESOURCE_PROVIDERS[providerKey];
    if (!provider) return null;
    const url = provider.urlByGroup?.[group] || provider.urlByGroup?.default || "";
    if (!url) return null;
    return {
      title: `${topicLabel}${label}`,
      provider: provider.provider,
      license: provider.license,
      url,
      tags: `${subject} ${label} ${provider.provider} ${group} ${subjectTopics.join(" ")} ${topic || ""}`
        .toLowerCase()
        .trim()
    };
  };

  return {
    notes: [makeResource("notes (OpenStax)", "openstax"), makeResource("concept notes (CK-12)", "ck12")].filter(
      Boolean
    ),
    classes: [makeResource("classes (MIT OCW)", "ocw"), makeResource("classes (Khan Academy)", "khan")].filter(
      Boolean
    ),
    bits: [makeResource("practice bits (Khan Academy)", "khan"), makeResource("quick bits (CK-12)", "ck12")].filter(
      Boolean
    )
  };
};

const EXAM_QUESTIONS = {
  Mathematics: [
    {
      question: "What is 7 x 8?",
      options: ["54", "56", "58", "64"],
      answerIndex: 1,
      explanation: "7 x 8 = 56."
    },
    {
      question: "Solve: 18 / 3",
      options: ["6", "9", "12", "15"],
      answerIndex: 0,
      explanation: "18 divided by 3 equals 6."
    },
    {
      question: "Which number is prime?",
      options: ["21", "29", "33", "39"],
      answerIndex: 1,
      explanation: "29 has no divisors other than 1 and itself."
    }
  ],
  Physics: [
    {
      question: "What is the SI unit of force?",
      options: ["Watt", "Pascal", "Newton", "Joule"],
      answerIndex: 2,
      explanation: "Force is measured in newtons (N)."
    },
    {
      question: "Earth's average gravitational acceleration is about:",
      options: ["1.6 m/s^2", "9.8 m/s^2", "15 m/s^2", "24 m/s^2"],
      answerIndex: 1,
      explanation: "Gravity at Earth's surface is about 9.8 m/s^2."
    },
    {
      question: "Which quantity is a vector?",
      options: ["Speed", "Mass", "Energy", "Velocity"],
      answerIndex: 3,
      explanation: "Velocity has both magnitude and direction."
    }
  ],
  Chemistry: [
    {
      question: "The chemical formula for water is:",
      options: ["H2O", "CO2", "O2", "NaCl"],
      answerIndex: 0,
      explanation: "Water is H2O."
    },
    {
      question: "A solution with pH less than 7 is:",
      options: ["Neutral", "Basic", "Acidic", "Salty"],
      answerIndex: 2,
      explanation: "pH below 7 indicates acidity."
    },
    {
      question: "The atomic number equals the number of:",
      options: ["Neutrons", "Protons", "Electrons and neutrons", "Nuclei"],
      answerIndex: 1,
      explanation: "Atomic number is the number of protons."
    }
  ],
  Biology: [
    {
      question: "The basic unit of life is the:",
      options: ["Atom", "Cell", "Organ", "Tissue"],
      answerIndex: 1,
      explanation: "All living things are made of cells."
    },
    {
      question: "Plants make food primarily through:",
      options: ["Respiration", "Photosynthesis", "Digestion", "Fermentation"],
      answerIndex: 1,
      explanation: "Photosynthesis converts light into chemical energy."
    },
    {
      question: "DNA stands for:",
      options: ["Deoxyribonucleic acid", "Ribonucleic acid", "Dynamic nucleic acid", "Dual nitrogen acid"],
      answerIndex: 0,
      explanation: "DNA is deoxyribonucleic acid."
    }
  ],
  English: [
    {
      question: "A noun is a word that names a:",
      options: ["Action", "Describing word", "Person, place, or thing", "Linking word"],
      answerIndex: 2,
      explanation: "Nouns name people, places, or things."
    },
    {
      question: "A synonym for 'quick' is:",
      options: ["Rapid", "Slow", "Heavy", "Late"],
      answerIndex: 0,
      explanation: "Rapid means quick."
    },
    {
      question: "A paragraph should include a:",
      options: ["Random sentence", "Topic sentence", "Title only", "Conclusion only"],
      answerIndex: 1,
      explanation: "A topic sentence sets the main idea."
    }
  ],
  History: [
    {
      question: "A primary source is:",
      options: ["A textbook", "An original document", "A modern summary", "A biography"],
      answerIndex: 1,
      explanation: "Primary sources come from the time being studied."
    },
    {
      question: "Chronology means:",
      options: ["Cause and effect", "Order of events", "Geographic location", "Opinion"],
      answerIndex: 1,
      explanation: "Chronology is the order of events."
    },
    {
      question: "Artifacts are used to:",
      options: ["Predict weather", "Study the past", "Write fiction", "Measure speed"],
      answerIndex: 1,
      explanation: "Artifacts provide evidence about history."
    }
  ],
  Geography: [
    {
      question: "Lines of latitude measure distance:",
      options: ["East and west", "North and south", "From the poles", "Along the equator only"],
      answerIndex: 1,
      explanation: "Latitude measures north-south position."
    },
    {
      question: "The equator is at:",
      options: ["0 degrees latitude", "30 degrees latitude", "60 degrees latitude", "90 degrees latitude"],
      answerIndex: 0,
      explanation: "The equator is 0 degrees latitude."
    }
  ],
  Economics: [
    {
      question: "Law of demand: when price rises, quantity demanded generally:",
      options: ["Rises", "Falls", "Stays the same", "Disappears"],
      answerIndex: 1,
      explanation: "Higher price usually reduces quantity demanded."
    },
    {
      question: "Scarcity means:",
      options: ["Unlimited resources", "Limited resources", "No needs", "No choices"],
      answerIndex: 1,
      explanation: "Scarcity is about limited resources."
    }
  ],
  "Computer Science": [
    {
      question: "Binary numbers use:",
      options: ["0 and 1", "1 and 2", "0 and 2", "2 and 3"],
      answerIndex: 0,
      explanation: "Binary is base-2 with digits 0 and 1."
    },
    {
      question: "An algorithm is a:",
      options: ["Computer virus", "Step-by-step procedure", "Programming language", "Hardware device"],
      answerIndex: 1,
      explanation: "Algorithms are step-by-step instructions."
    }
  ]
};

const buildGenericExam = (subject) => [
  {
    question: `Which approach helps learn ${subject} effectively?`,
    options: [
      "Regular practice and review",
      "Skipping practice",
      "Only memorizing definitions",
      "Avoiding feedback"
    ],
    answerIndex: 0,
    explanation: "Practice and review improve understanding and recall."
  },
  {
    question: `Which resource is most useful for studying ${subject}?`,
    options: [`${subject} notes and examples`, "Only social media posts", "Unrelated topics", "Random quotes"],
    answerIndex: 0,
    explanation: "Subject notes and examples support focused learning."
  }
];

const getExamQuestions = (subject) => EXAM_QUESTIONS[subject] || buildGenericExam(subject);

const STUDY_TOOL_OPTIONS = [
  { key: "ppt", label: "Create PPT", icon: FiLayers },
  { key: "notes", label: "Notes", icon: FiFileText },
  { key: "paragraph", label: "Paragraph", icon: FiEdit3 },
  { key: "image", label: "Find Images", icon: FiImage }
];

const ASSISTANT_ACTIONS = [
  { key: "notes", label: "Create Notes", icon: FiFileText },
  { key: "ppt", label: "Create PPT", icon: FiLayers },
  { key: "images", label: "Image Prompts", icon: FiImage },
  { key: "novel", label: "Novel Outline", icon: FiBookOpen },
  { key: "music", label: "Music Album", icon: FiMusic },
  { key: "summary", label: "Short Notes", icon: FiZap },
  { key: "fix_dates", label: "Fix Dates", icon: FiCalendar }
];

const buildAiDraft = (type, subject, query) => {
  const topic = query?.trim() || subject;
  if (type === "ppt") {
    return {
      type,
      title: `PPT outline: ${topic}`,
      items: [
        "Title slide: topic + your name/class",
        "Slide 2: Key definition or overview",
        "Slide 3: Core concepts (3 to 4 points)",
        "Slide 4: Real-world example or case",
        "Slide 5: Quick summary and 3 takeaways",
        "Slide 6: Practice question or mini-quiz"
      ]
    };
  }
  if (type === "notes") {
    return {
      type,
      title: `Notes: ${topic}`,
      items: [
        "Definition or overview",
        "Key terms with short meaning",
        "Important formula or rule (if any)",
        "Example or application",
        "Common mistakes to avoid"
      ]
    };
  }
  if (type === "paragraph") {
    return {
      type,
      title: `Paragraph: ${topic}`,
      text: `${topic} is an important part of ${subject}. Start by explaining the main idea in simple words, then add one or two key facts or examples. End with why this topic matters and how it connects to real life or future learning.`
    };
  }
  if (type === "image") {
    const encoded = encodeURIComponent(topic);
    return {
      type,
      title: `Image search: ${topic}`,
      links: [
        {
          label: "Wikimedia Commons",
          url: `https://commons.wikimedia.org/w/index.php?search=${encoded}&title=Special:MediaSearch&type=image`
        }
      ],
      note: "Check image licenses before reusing."
    };
  }
  return null;
};

const clampText = (value, max = 7000) => {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n...[truncated]`;
};

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const isTextFile = (file) => {
  if (!file) return false;
  if (file.type && file.type.startsWith("text/")) return true;
  const name = (file.name || "").toLowerCase();
  return [".txt", ".md", ".csv", ".json", ".log"].some((ext) => name.endsWith(ext));
};

const readFileText = (file) =>
  new Promise((resolve) => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsText(file);
  });

const buildAssistantPrompt = ({
  action,
  subject,
  topic,
  notes,
  uploadsText,
  extraInstruction
}) => {
  const target = topic || subject || "the topic";
  const contextBlocks = [];
  if (notes) contextBlocks.push(`Notes:\n${clampText(notes)}`);
  if (uploadsText) contextBlocks.push(`Upload text:\n${clampText(uploadsText)}`);
  if (extraInstruction) contextBlocks.push(`User request:\n${extraInstruction}`);

  if (action === "summary") {
    return [
      `Summarize the study notes about "${target}" into short bullet points.`,
      "Keep it concise and easy to study.",
      ...contextBlocks
    ].join("\n\n");
  }
  if (action === "fix_dates") {
    return [
      `Fix and normalize any dates in the notes about "${target}".`,
      "Return only the corrected notes text.",
      ...contextBlocks
    ].join("\n\n");
  }
  if (action === "ppt") {
    return [
      `Create a PPT outline for "${target}".`,
      "Return slide titles with 3-5 bullet points each.",
      ...contextBlocks
    ].join("\n\n");
  }
  if (action === "novel") {
    return [
      `Create a short novel outline inspired by "${target}".`,
      "Include characters, setting, and a 5-part plot arc.",
      ...contextBlocks
    ].join("\n\n");
  }
  if (action === "music") {
    return [
      `Create a music album concept for "${target}".`,
      "Include style, mood, and a 6-10 track list.",
      ...contextBlocks
    ].join("\n\n");
  }
  if (action === "images") {
    return [
      `Create 6 image prompt ideas for "${target}".`,
      "Each prompt should be vivid and short.",
      ...contextBlocks
    ].join("\n\n");
  }
  return [
    `Create study notes for "${target}".`,
    "Use clear bullet points and short explanations.",
    ...contextBlocks
  ].join("\n\n");
};

const isLocalHost = () => {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
};

const getLocalApiBase = () => {
  if (typeof window === "undefined") return "http://localhost:8080";
  const host = window.location.hostname || "localhost";
  return `http://${host}:8080`;
};

const describeAxiosError = (error) => {
  const status = error?.response?.status;
  const payloadMessage = error?.response?.data?.message || error?.response?.data?.error;
  const baseMessage = payloadMessage || error?.message || "Request failed";
  return status ? `${baseMessage} (${status})` : baseMessage;
};

export default function StudyMode() {
  const [selectedSubject, setSelectedSubject] = useState(STUDY_SUBJECTS[0]);
  const [studyQuery, setStudyQuery] = useState("");
  const [studyToolOutput, setStudyToolOutput] = useState(null);
  const [examMode, setExamMode] = useState(false);
  const [examIndex, setExamIndex] = useState(0);
  const [examSelections, setExamSelections] = useState({});
  const [examResults, setExamResults] = useState({});
  const [subjectListOpen, setSubjectListOpen] = useState(false);
  const [assistantName, setAssistantName] = useState("HRS");
  const [assistantStatus, setAssistantStatus] = useState("offline");
  const [assistantError, setAssistantError] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [assistantDraft, setAssistantDraft] = useState("");
  const [assistantHistory, setAssistantHistory] = useState([]);
  const [assistantNotes, setAssistantNotes] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const subjectScrollRef = useRef(null);
  const realtimeRef = useRef({ pc: null, dc: null, stream: null, audioEl: null });
  const assistantDraftRef = useRef("");
  const transcriptRef = useRef("");
  const pendingActionRef = useRef(null);

  const searchMeta = useMemo(() => resolveSearchMeta(studyQuery), [studyQuery]);
  const effectiveSubject = searchMeta.subject || selectedSubject;
  const effectiveTopic = searchMeta.topic || "";
  const resolvedQuery = searchMeta.corrected || searchMeta.normalized;
  const displayQuery = effectiveTopic ? toTitleCase(effectiveTopic) : resolvedQuery;

  const studyResources = useMemo(
    () => buildStudyResources(effectiveSubject, effectiveTopic || null),
    [effectiveSubject, effectiveTopic]
  );
  const studyExamQuestions = useMemo(() => getExamQuestions(selectedSubject), [selectedSubject]);
  const studyRecommendations = useMemo(() => {
    const query = resolvedQuery.trim().toLowerCase();
    const tokens = query ? query.split(" ").filter(Boolean) : [];
    const matches = (item) => {
      if (!item) return false;
      if (!query) return true;
      const haystack = `${item.title} ${item.provider} ${item.tags || ""}`.toLowerCase();
      if (haystack.includes(query)) return true;
      if (!tokens.length) return false;
      return tokens.every((token) => haystack.includes(token));
    };
    return {
      notes: studyResources.notes.filter(matches),
      classes: studyResources.classes.filter(matches)
    };
  }, [resolvedQuery, studyResources]);

  useEffect(() => {
    if (!searchMeta.subject) return;
    if (searchMeta.subject === selectedSubject) return;
    setSelectedSubject(searchMeta.subject);
  }, [searchMeta.subject, selectedSubject]);

  useEffect(() => {
    if (!subjectListOpen) return;
    const idx = Math.max(0, STUDY_SUBJECTS.indexOf(selectedSubject));
    if (!subjectScrollRef.current) return;
    scrollToSubject(idx);
  }, [subjectListOpen, selectedSubject]);

  useEffect(() => {
    setExamIndex(0);
    setExamSelections({});
    setExamResults({});
  }, [selectedSubject]);

  const disconnectRealtime = () => {
    const current = realtimeRef.current;
    if (current?.dc) {
      try {
        current.dc.close();
      } catch {
        // ignore close errors
      }
    }
    if (current?.pc) {
      try {
        current.pc.close();
      } catch {
        // ignore close errors
      }
    }
    if (current?.stream) {
      current.stream.getTracks().forEach((track) => track.stop());
    }
    realtimeRef.current = { pc: null, dc: null, stream: null, audioEl: null };
    setAssistantStatus("offline");
  };

  useEffect(() => () => disconnectRealtime(), []);

  const setMicEnabled = (enabled) => {
    const stream = realtimeRef.current.stream;
    if (!stream) return;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = Boolean(enabled);
    });
  };

  const resetAssistantDraft = () => {
    assistantDraftRef.current = "";
    setAssistantDraft("");
  };

  const appendAssistantDraft = (delta) => {
    if (!delta) return;
    assistantDraftRef.current += delta;
    setAssistantDraft(assistantDraftRef.current);
  };

  const finalizeAssistantDraft = () => {
    const finalText = assistantDraftRef.current.trim();
    assistantDraftRef.current = "";
    setAssistantDraft("");
    if (!finalText) {
      pendingActionRef.current = null;
      return;
    }
    setAssistantHistory((prev) => [...prev, { role: "assistant", text: finalText }]);
    if (pendingActionRef.current === "fix_dates" || pendingActionRef.current === "summary") {
      setAssistantNotes(finalText);
    }
    pendingActionRef.current = null;
  };

  const appendTranscriptDelta = (delta) => {
    if (!delta) return;
    transcriptRef.current += delta;
    setLiveTranscript(transcriptRef.current);
  };

  const commitTranscript = (finalText) => {
    const text = (finalText || transcriptRef.current || "").trim();
    transcriptRef.current = "";
    setLiveTranscript("");
    if (!text) return;
    setAssistantNotes((prev) => (prev ? `${prev}\n${text}` : text));
  };

  const sendRealtimeEvent = (payload) => {
    const dc = realtimeRef.current.dc;
    if (!dc || dc.readyState !== "open") return;
    dc.send(JSON.stringify(payload));
  };

  const sendTextMessage = (text, outputModalities) => {
    const message = String(text || "").trim();
    if (!message) return;
    resetAssistantDraft();
    setAssistantHistory((prev) => [...prev, { role: "user", text: message }]);
    sendRealtimeEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: message }]
      }
    });
    if (outputModalities) {
      sendRealtimeEvent({ type: "response.create", response: { output_modalities: outputModalities } });
    } else {
      sendRealtimeEvent({ type: "response.create" });
    }
  };

  const handleRealtimeMessage = (event) => {
    if (!event?.data) return;
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!payload?.type) return;
    if (payload.type === "error") {
      setAssistantError(payload?.error?.message || "Voice assistant error");
      return;
    }
    if (payload.type === "conversation.item.input_audio_transcription.delta") {
      appendTranscriptDelta(payload.delta);
      return;
    }
    if (payload.type === "conversation.item.input_audio_transcription.completed") {
      commitTranscript(payload.transcript);
      return;
    }
    if (payload.type === "response.output_text.delta") {
      appendAssistantDraft(payload.delta);
      return;
    }
    if (payload.type === "response.output_audio_transcript.delta") {
      appendAssistantDraft(payload.delta);
      return;
    }
    if (payload.type === "response.output_text.done" || payload.type === "response.output_audio_transcript.done") {
      finalizeAssistantDraft();
      return;
    }
    if (payload.type === "response.done") {
      finalizeAssistantDraft();
    }
  };

  const sendSessionUpdate = (outputModalities) => {
    sendRealtimeEvent({
      type: "session.update",
      session: {
        output_modalities: outputModalities || ["audio"],
        audio: {
          output: { voice: "alloy" },
          input: {
            transcription: { model: "gpt-4o-mini-transcribe" },
            turn_detection: {
              type: "server_vad",
              create_response: true,
              interrupt_response: true
            }
          }
        }
      }
    });
  };

  const fetchRealtimeToken = async () => {
    const topic = displayQuery || resolvedQuery || studyQuery || "";
    const localBase = isLocalHost() ? getLocalApiBase() : null;
    try {
      const response = await api.post(
        "/api/public/study-assistant/realtime-token",
        {
          assistantName,
          subject: effectiveSubject,
          topic
        },
        { skipAuth: true, baseURL: localBase || undefined }
      );
      return response?.data?.value || response?.data?.client_secret?.value || "";
    } catch (error) {
      if (isLocalHost() && error?.response?.status === 404 && !localBase) {
        const response = await api.post(
          "/api/public/study-assistant/realtime-token",
          {
            assistantName,
            subject: effectiveSubject,
            topic
          },
          { baseURL: getLocalApiBase(), skipAuth: true }
        );
        return response?.data?.value || response?.data?.client_secret?.value || "";
      }
      throw new Error(describeAxiosError(error));
    }
  };

  const ensureRealtimeConnected = async (enableMic) => {
    if (realtimeRef.current.pc) {
      if (enableMic != null) setMicEnabled(enableMic);
      return;
    }
    setAssistantError("");
    setAssistantStatus("connecting");
    let token = "";
    try {
      token = await fetchRealtimeToken();
    } catch (err) {
      setAssistantError(err?.message || "Could not create a voice session.");
      setAssistantStatus("offline");
      return;
    }
    if (!token) {
      setAssistantError("Realtime token was empty.");
      setAssistantStatus("offline");
      return;
    }
    try {
      const pc = new RTCPeerConnection();
      const audioEl = new Audio();
      audioEl.autoplay = true;

      pc.ontrack = (event) => {
        const stream = event.streams?.[0];
        if (stream) audioEl.srcObject = stream;
      };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getAudioTracks().forEach((track) => {
        track.enabled = Boolean(enableMic);
        pc.addTrack(track, stream);
      });

      const dc = pc.createDataChannel("oai-events");
      const initialModalities = enableMic ? ["audio"] : ["text"];
      dc.onmessage = handleRealtimeMessage;
      dc.onopen = () => {
        sendSessionUpdate(initialModalities);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setAssistantStatus("ready");
        } else if (pc.connectionState === "failed") {
          setAssistantStatus("offline");
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/sdp"
        }
      });

      if (!sdpResponse.ok) {
        throw new Error("OpenAI realtime call failed");
      }

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      realtimeRef.current = { pc, dc, stream, audioEl };
      setAssistantStatus("ready");
    } catch (err) {
      disconnectRealtime();
      setAssistantError("Unable to connect the voice assistant.");
      setAssistantStatus("offline");
    }
  };

  const handleVoiceToggle = async () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    await ensureRealtimeConnected(next);
    setMicEnabled(next);
    if (realtimeRef.current.dc?.readyState === "open") {
      sendSessionUpdate(next ? ["audio"] : ["text"]);
    }
  };

  const handleSendChat = async () => {
    const message = chatInput.trim();
    if (!message) return;
    await ensureRealtimeConnected(false);
    sendTextMessage(message, voiceEnabled ? ["audio"] : ["text"]);
    setChatInput("");
  };

  const handleAssistantAction = async (actionKey) => {
    const uploadsText = uploadedFiles
      .map((file) => file?.text || "")
      .filter(Boolean)
      .join("\n\n");
    const prompt = buildAssistantPrompt({
      action: actionKey,
      subject: effectiveSubject,
      topic: displayQuery || resolvedQuery || studyQuery,
      notes: assistantNotes,
      uploadsText,
      extraInstruction: ""
    });
    pendingActionRef.current = actionKey;
    await ensureRealtimeConnected(false);
    sendTextMessage(prompt, ["text"]);
  };

  const handleFilesSelected = async (event) => {
    const files = Array.from(event?.target?.files || []);
    if (!files.length) return;
    setUploading(true);
    const nextEntries = [];
    for (const file of files) {
      const entry = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        size: file.size,
        type: file.type || "file",
        status: "pending",
        url: "",
        text: ""
      };
      if (isTextFile(file)) {
        entry.text = await readFileText(file);
      }
      try {
        const form = new FormData();
        form.append("file", file);
        const response = await api.post("/api/public/study-assistant/upload", form, {
          headers: { "Content-Type": "multipart/form-data" },
          skipAuth: true,
          baseURL: isLocalHost() ? getLocalApiBase() : undefined
        });
        entry.url = response?.data?.url || "";
        entry.status = entry.url ? "uploaded" : "uploaded";
      } catch (error) {
        if (isLocalHost() && error?.response?.status === 404) {
          try {
            const form = new FormData();
            form.append("file", file);
            const response = await api.post("/api/public/study-assistant/upload", form, {
              headers: { "Content-Type": "multipart/form-data" },
              baseURL: getLocalApiBase(),
              skipAuth: true
            });
            entry.url = response?.data?.url || "";
            entry.status = entry.url ? "uploaded" : "uploaded";
          } catch {
            entry.status = "failed";
          }
        } else {
          entry.status = "failed";
        }
      }
      nextEntries.push(entry);
    }
    setUploadedFiles((prev) => [...prev, ...nextEntries]);
    setUploading(false);
    if (event?.target) event.target.value = "";
  };

  const scrollToSubject = (index) => {
    const container = subjectScrollRef.current;
    if (!container) return;
    const clamped = Math.max(0, Math.min(STUDY_SUBJECTS.length - 1, index));
    const top = SUBJECT_PICKER_PADDING + clamped * SUBJECT_ITEM_HEIGHT;
    container.scrollTo({ top, behavior: "smooth" });
  };

  const handleSubjectScroll = (event) => {
    const top = event.currentTarget.scrollTop;
    const rawIndex = (top - SUBJECT_PICKER_PADDING) / SUBJECT_ITEM_HEIGHT;
    const idx = Math.max(0, Math.min(STUDY_SUBJECTS.length - 1, Math.floor(rawIndex + 0.35)));
    const nextSubject = STUDY_SUBJECTS[idx];
    if (nextSubject && nextSubject !== selectedSubject) {
      setSelectedSubject(nextSubject);
    }
  };

  const handleStudyToolClick = (toolKey) => {
    const nextOutput = buildAiDraft(toolKey, selectedSubject, displayQuery || studyQuery);
    if (!nextOutput) return;
    setStudyToolOutput(nextOutput);
  };

  const handleExamSelect = (optionIndex) => {
    setExamSelections((prev) => ({ ...prev, [examIndex]: optionIndex }));
    setExamResults((prev) => {
      if (prev[examIndex] == null) return prev;
      return { ...prev, [examIndex]: null };
    });
  };

  const handleExamCheck = () => {
    const current = studyExamQuestions[examIndex];
    if (!current) return;
    const selected = examSelections[examIndex];
    if (selected == null) return;
    const correct = selected === current.answerIndex;
    setExamResults((prev) => ({ ...prev, [examIndex]: correct }));
  };

  const handleExamNext = () => {
    setExamIndex((prev) => Math.min(prev + 1, studyExamQuestions.length - 1));
  };

  const handleExamPrev = () => {
    setExamIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleExamReset = () => {
    setExamIndex(0);
    setExamSelections({});
    setExamResults({});
  };

  const trimmedStudyQuery = studyQuery.trim();
  const hasQuery = Boolean(trimmedStudyQuery);
  const resolvedLabel = displayQuery || trimmedStudyQuery;
  const correctionHint =
    hasQuery && searchMeta.didCorrect && resolvedLabel
      ? `Showing results for "${resolvedLabel}" (corrected from "${trimmedStudyQuery}").`
      : "";
  const autoNotesDraft = hasQuery ? buildAiDraft("notes", effectiveSubject, resolvedLabel) : null;
  const recommendedNotes = studyRecommendations.notes.slice(0, 3);
  const recommendedClasses = studyRecommendations.classes.slice(0, 3);
  const examCurrent = studyExamQuestions[examIndex];
  const examSelected = examSelections[examIndex];
  const examResult = examResults[examIndex];
  const examScore = Object.values(examResults).filter(Boolean).length;

  return (
    <div className="reels-page reels-study">
      <div className="reels-study-card">
        <div className="reels-study-header">
          <div className="reels-study-title">
            <div className="reels-study-icon">
              <FaGraduationCap />
            </div>
            <div className="reels-study-title-text">
              <h2>Study mode</h2>
              <div className="reels-study-current">Subject: {selectedSubject}</div>
            </div>
          </div>
        </div>
        <div className="reels-study-assist">
          <div className="reels-study-search-row">
            <form
              className="reels-study-search"
              onSubmit={(event) => {
                event.preventDefault();
              }}
            >
              <FiSearch className="reels-study-search-icon" aria-hidden="true" />
              <input
                type="search"
                value={studyQuery}
                onChange={(event) => setStudyQuery(event.target.value)}
                placeholder={`Search ${selectedSubject} topic`}
                aria-label="Search study topic"
              />
              <button type="submit" className="reels-study-search-btn">
                Search
              </button>
            </form>
            <button
              type="button"
              className={`reels-study-exam-toggle ${examMode ? "is-active" : ""}`}
              onClick={() => setExamMode((prev) => !prev)}
              aria-pressed={examMode}
            >
              <FiCheckCircle aria-hidden="true" />
              {examMode ? "Exam On" : "Exam"}
            </button>
          </div>
          <div className="reels-study-tools">
            {STUDY_TOOL_OPTIONS.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.key}
                  type="button"
                  className={`reels-study-tool ${studyToolOutput?.type === tool.key ? "is-active" : ""}`}
                  onClick={() => handleStudyToolClick(tool.key)}
                >
                  <Icon className="reels-study-tool-icon" aria-hidden="true" />
                  <span>{tool.label}</span>
                </button>
              );
            })}
          </div>
          <div className="reels-study-assistant">
            <div className="reels-study-assistant-header">
              <div className="reels-study-assistant-title">
                <div className="reels-study-assistant-name">
                  <span className="reels-study-assistant-badge">{assistantName || "HRS"}</span>
                  <input
                    type="text"
                    value={assistantName}
                    onChange={(event) => setAssistantName(event.target.value.toUpperCase())}
                    placeholder="HRS"
                    aria-label="Assistant name"
                  />
                </div>
                <p>Voice assistant for notes, summaries, and study outputs.</p>
              </div>
              <div className="reels-study-assistant-status">
                <span className={`reels-study-assistant-chip is-${assistantStatus}`}>{assistantStatus}</span>
                {assistantError && <span className="reels-study-assistant-error">{assistantError}</span>}
              </div>
            </div>
            <div className="reels-study-assistant-controls">
              <button
                type="button"
                className={`reels-study-voice-toggle ${voiceEnabled ? "is-on" : ""}`}
                onClick={handleVoiceToggle}
              >
                {voiceEnabled ? <FiMic /> : <FiMicOff />}
                {voiceEnabled ? "Voice On" : "Voice Off"}
              </button>
              <div className={`reels-study-live-transcript ${liveTranscript ? "is-active" : ""}`}>
                {liveTranscript || (voiceEnabled ? "Listening for your voice..." : "Voice is off. Use chat below.")}
              </div>
            </div>
            <div className="reels-study-assistant-grid">
              <div className="reels-study-assistant-panel">
                <div className="reels-study-assistant-panel-header">
                  <FiMessageSquare aria-hidden="true" />
                  <h4>Chat with {assistantName || "HRS"}</h4>
                </div>
                <div className="reels-study-assistant-messages">
                  {assistantHistory.length ? (
                    assistantHistory.map((item, idx) => (
                      <div key={`${item.role}-${idx}`} className={`reels-study-message is-${item.role}`}>
                        <span>{item.text}</span>
                      </div>
                    ))
                  ) : (
                    <p className="reels-study-assistant-empty">Ask a topic or paste your notes to begin.</p>
                  )}
                  {assistantDraft && (
                    <div className="reels-study-message is-assistant is-typing">
                      <span>{assistantDraft}</span>
                    </div>
                  )}
                </div>
                <div className="reels-study-assistant-input">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder="Type a topic or paste notes..."
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleSendChat();
                    }}
                  />
                  <button type="button" onClick={handleSendChat}>
                    <FiSend aria-hidden="true" />
                    Send
                  </button>
                </div>
              </div>
              <div className="reels-study-assistant-panel">
                <div className="reels-study-assistant-panel-header">
                  <FiFileText aria-hidden="true" />
                  <h4>Notes</h4>
                </div>
                <textarea
                  className="reels-study-notes-input"
                  value={assistantNotes}
                  onChange={(event) => setAssistantNotes(event.target.value)}
                  placeholder="Voice notes and summaries will appear here. You can edit anytime."
                  rows={8}
                />
                <div className="reels-study-assistant-actions">
                  {ASSISTANT_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.key}
                        type="button"
                        className="reels-study-assistant-action"
                        onClick={() => handleAssistantAction(action.key)}
                      >
                        <Icon aria-hidden="true" />
                        {action.label}
                      </button>
                    );
                  })}
                </div>
                <div className="reels-study-assistant-upload">
                  <label className="reels-study-upload-btn">
                    <FiUpload aria-hidden="true" />
                    Upload files
                    <input type="file" multiple onChange={handleFilesSelected} />
                  </label>
                  {uploading && <span className="reels-study-uploading">Uploading...</span>}
                  {uploadedFiles.length ? (
                    <ul className="reels-study-upload-list">
                      {uploadedFiles.map((file) => (
                        <li key={file.id} className={`reels-study-upload-item is-${file.status}`}>
                          <div>
                            <strong>{file.name}</strong>
                            <span>{formatBytes(file.size)}</span>
                          </div>
                          {file.url ? (
                            <a href={file.url} target="_blank" rel="noreferrer noopener">
                              View
                            </a>
                          ) : (
                            <span>{file.status}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="reels-study-assistant-empty">No uploads yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="reels-study-recommendations">
            <div className="reels-study-recommendations-header">
              <h3>
                {trimmedStudyQuery ? `Recommendations for "${resolvedLabel}"` : `Recommended for ${selectedSubject}`}
              </h3>
              <p>Notes and classes that match your topic.</p>
              {correctionHint && <p className="reels-study-correction">{correctionHint}</p>}
            </div>
            {autoNotesDraft && (
              <div className="reels-study-ai-preview">
                <div className="reels-study-ai-preview-header">
                  <h4>AI notes draft</h4>
                  <span>Auto-generated</span>
                </div>
                <p>
                  Topic: <strong>{resolvedLabel}</strong> · Subject: {effectiveSubject}
                </p>
                {autoNotesDraft.items && (
                  <ul>
                    {autoNotesDraft.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="reels-study-recommendations-grid">
              <div className="reels-study-recommendations-card">
                <h4>Notes</h4>
                {recommendedNotes.length ? (
                  <ul>
                    {recommendedNotes.map((item) => (
                      <li key={`rec-note-${item.title}`}>
                        <a href={item.url} target="_blank" rel="noreferrer noopener">
                          {item.title}
                        </a>
                        <span>{item.provider}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="reels-study-empty">No matching notes yet.</p>
                )}
              </div>
              <div className="reels-study-recommendations-card">
                <h4>Classes</h4>
                {recommendedClasses.length ? (
                  <ul>
                    {recommendedClasses.map((item) => (
                      <li key={`rec-class-${item.title}`}>
                        <a href={item.url} target="_blank" rel="noreferrer noopener">
                          {item.title}
                        </a>
                        <span>{item.provider}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="reels-study-empty">No matching classes yet.</p>
                )}
              </div>
            </div>
          </div>
          {studyToolOutput && (
            <div className="reels-study-output">
              <div className="reels-study-output-header">
                <h3>{studyToolOutput.title}</h3>
                <span>Draft output</span>
              </div>
              {studyToolOutput.text && <p>{studyToolOutput.text}</p>}
              {studyToolOutput.items && (
                <ul>
                  {studyToolOutput.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              {studyToolOutput.links && (
                <ul className="reels-study-output-links">
                  {studyToolOutput.links.map((item) => (
                    <li key={item.url}>
                      <a href={item.url} target="_blank" rel="noreferrer noopener">
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {studyToolOutput.note && <p className="reels-study-output-note">{studyToolOutput.note}</p>}
            </div>
          )}
          {examMode && (
            <div className="reels-study-exam">
              <div className="reels-study-exam-header">
                <div>
                  <h3>Practice exam</h3>
                  <p>Pick the correct answer to improve your understanding.</p>
                </div>
                <div className="reels-study-exam-meta">
                  <span>
                    Question {Math.min(examIndex + 1, studyExamQuestions.length)} of {studyExamQuestions.length}
                  </span>
                  <span>Score: {examScore}</span>
                </div>
              </div>
              {examCurrent ? (
                <div className="reels-study-exam-body">
                  <h4>{examCurrent.question}</h4>
                  <div className="reels-study-exam-options">
                    {examCurrent.options.map((option, optionIndex) => {
                      const isSelected = examSelected === optionIndex;
                      const isCorrect = examResult != null && optionIndex === examCurrent.answerIndex;
                      const isWrong = examResult === false && isSelected && !isCorrect;
                      return (
                        <label
                          key={`${examCurrent.question}-${option}`}
                          className={`reels-study-exam-option ${isSelected ? "is-selected" : ""} ${
                            isCorrect ? "is-correct" : ""
                          } ${isWrong ? "is-wrong" : ""}`}
                        >
                          <input
                            type="radio"
                            name={`exam-${examIndex}`}
                            checked={isSelected}
                            onChange={() => handleExamSelect(optionIndex)}
                          />
                          <span>{option}</span>
                        </label>
                      );
                    })}
                  </div>
                  {examResult != null && (
                    <p className={`reels-study-exam-feedback ${examResult ? "is-correct" : "is-wrong"}`}>
                      {examResult ? "Correct!" : "Not quite. Try again or review the explanation."}
                    </p>
                  )}
                  {examResult != null && <p className="reels-study-exam-explain">{examCurrent.explanation}</p>}
                  <div className="reels-study-exam-actions">
                    <button type="button" onClick={handleExamPrev} disabled={examIndex === 0}>
                      Previous
                    </button>
                    <button type="button" onClick={handleExamCheck} disabled={examSelected == null}>
                      Check answer
                    </button>
                    <button
                      type="button"
                      onClick={handleExamNext}
                      disabled={examIndex >= studyExamQuestions.length - 1}
                    >
                      Next
                    </button>
                    <button type="button" onClick={handleExamReset}>
                      Reset
                    </button>
                  </div>
                </div>
              ) : (
                <p className="reels-study-empty">No exam questions yet for this subject.</p>
              )}
            </div>
          )}
        </div>
          <div
            className="reels-study-resources"
            id="study-resources-panel"
            role="dialog"
            aria-label={`Resources for ${selectedSubject}`}
          >
            <div className="reels-study-resources-header">
              <div className="reels-study-resources-title">Subjects</div>
              <button
                type="button"
                className="reels-study-subject-toggle"
                onClick={() => setSubjectListOpen((prev) => !prev)}
                aria-expanded={subjectListOpen}
              >
                <span>{selectedSubject}</span>
                {subjectListOpen ? <FiChevronUp /> : <FiChevronDown />}
              </button>
            </div>
            <div className={`reels-study-resources-body ${subjectListOpen ? "is-open" : ""}`}>
              <div className="reels-study-resources-picker" aria-label="Study subject picker">
                <div className="reels-study-picker-shell">
                  <div
                    className="reels-study-picker-list"
                    ref={subjectScrollRef}
                    onScroll={handleSubjectScroll}
                    role="listbox"
                    aria-label="Subjects"
                  >
                    {STUDY_SUBJECTS.map((subject, idx) => (
                      <button
                        key={subject}
                        type="button"
                        className={`reels-study-picker-item ${subject === selectedSubject ? "is-active" : ""}`}
                        onClick={() => {
                          scrollToSubject(idx);
                          setSubjectListOpen(false);
                        }}
                        role="option"
                        aria-selected={subject === selectedSubject}
                      >
                        {subject}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
      </div>
    </div>
  );
}
