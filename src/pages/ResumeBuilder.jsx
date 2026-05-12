import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getDefaultResume, loadResume, saveResume } from "../services/resumeStorage";
import api from "../api/axios";
import { clearAuthStorage } from "../auth";
import "./ResumeBuilder.css";

const coreSections = [
  {
    key: "personal",
    title: "Personal Details",
    subtitle: "Name, role, and contact",
    icon: "PD",
    accent: "#2f7cf7",
  },
  {
    key: "education",
    title: "Education",
    subtitle: "Degrees and certifications",
    icon: "ED",
    accent: "#4aa6ff",
  },
  {
    key: "experience",
    title: "Experience",
    subtitle: "Roles and responsibilities",
    icon: "EX",
    accent: "#3aa3c9",
  },
  {
    key: "skills",
    title: "Skills",
    subtitle: "Tools and strengths",
    icon: "SK",
    accent: "#2ab39b",
  },
  {
    key: "objective",
    title: "Objective",
    subtitle: "Short professional summary",
    icon: "OB",
    accent: "#3abf88",
  },
  {
    key: "reference",
    title: "Reference",
    subtitle: "People who can vouch for you",
    icon: "RF",
    accent: "#5aa6ff",
  },
];

const moreSections = [
  {
    key: "projects",
    title: "Projects",
    subtitle: "Key work samples",
    icon: "PR",
    accent: "#6a8bff",
  },
  {
    key: "achievements",
    title: "Achievements and Awards",
    subtitle: "Milestones and recognition",
    icon: "AW",
    accent: "#8a7bff",
  },
  {
    key: "coverLetter",
    title: "Cover Letter",
    subtitle: "Personalized pitch",
    icon: "CL",
    accent: "#7f6dff",
  },
  {
    key: "declaration",
    title: "Declaration",
    subtitle: "Statements and consent",
    icon: "DC",
    accent: "#6a7fd8",
  },
];

const listTemplates = {
  education: {
    degree: "",
    school: "",
    start: "",
    end: "",
    details: "",
  },
  experience: {
    role: "",
    company: "",
    start: "",
    end: "",
    details: "",
  },
  projects: {
    name: "",
    description: "",
    media: "",
  },
  customSections: {
    title: "",
    content: "",
  },
};

const isFilled = (value) => String(value || "").trim().length > 0;

const hasEntry = (entry) =>
  Object.values(entry || {}).some((value) => isFilled(value));

const splitMedia = (value) =>
  String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

const mergeMedia = (existing, nextUrls) => {
  const combined = [...splitMedia(existing), ...nextUrls];
  const unique = Array.from(new Set(combined));
  return unique.join("\n");
};

export default function ResumeBuilder() {
  const navigate = useNavigate();
  const location = useLocation();
  const [resume, setResume] = useState(() => getDefaultResume());
  const [hydrated, setHydrated] = useState(false);
  const [openSection, setOpenSection] = useState("personal");
  const saveTimerRef = useRef(null);
  const [projectUploadState, setProjectUploadState] = useState({});
  const [profileUpload, setProfileUpload] = useState({ uploading: false, error: "" });

  useEffect(() => {
    let mounted = true;
    loadResume().then((data) => {
      if (!mounted) return;
      setResume(data);
      setHydrated(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    const target = params.get("section");
    if (target) {
      setOpenSection(target);
    }
  }, [location.search]);

  useEffect(() => {
    if (!hydrated) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveResume(resume);
    }, 600);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [resume, hydrated]);

  const updatePersonal = (field, value) => {
    setResume((prev) => ({
      ...prev,
      personal: {
        ...prev.personal,
        [field]: value,
      },
    }));
  };

  const updateField = (field, value) => {
    setResume((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updateListItem = (key, index, field, value) => {
    setResume((prev) => {
      const list = prev[key].map((item, idx) =>
        idx === index ? { ...item, [field]: value } : item
      );
      return { ...prev, [key]: list };
    });
  };

  const addListItem = (key) => {
    setResume((prev) => ({
      ...prev,
      [key]: [...prev[key], { ...listTemplates[key] }],
    }));
  };

  const removeListItem = (key, index, allowEmpty = false) => {
    setResume((prev) => {
      const list = prev[key].filter((_, idx) => idx !== index);
      if (list.length === 0 && !allowEmpty) {
        list.push({ ...listTemplates[key] });
      }
      return { ...prev, [key]: list };
    });
  };

  const addCustomSection = () => {
    const nextIndex = resume.customSections.length;
    setResume((prev) => ({
      ...prev,
      customSections: [...prev.customSections, { ...listTemplates.customSections }],
    }));
    setOpenSection(`custom-${nextIndex}`);
  };

  const sectionStatus = useMemo(() => {
    return {
      personal: Object.values(resume.personal || {}).some(isFilled),
      education: resume.education?.some(hasEntry),
      experience: resume.experience?.some(hasEntry),
      skills: isFilled(resume.skills),
      objective: isFilled(resume.objective),
      reference: isFilled(resume.references),
      projects: resume.projects?.some(hasEntry),
      achievements: isFilled(resume.achievements),
      coverLetter: isFilled(resume.coverLetter),
      declaration: isFilled(resume.declaration),
    };
  }, [resume]);

  const toggleSection = (key) => {
    setOpenSection((prev) => (prev === key ? "" : key));
  };

  const setProjectStatus = (index, patch) => {
    setProjectUploadState((prev) => ({
      ...prev,
      [index]: {
        uploading: false,
        error: "",
        ...(prev[index] || {}),
        ...patch,
      },
    }));
  };

  const handleProjectMediaUpload = async (index, files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setProjectStatus(index, { uploading: true, error: "" });
    const uploadedUrls = [];

    for (const file of list) {
      if (!file) continue;
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await api.post("/api/resume/media", form, {
          suppressAuthRedirect: true,
        });
        const url = res?.data?.mediaUrl || res?.data?.url || "";
        if (url) uploadedUrls.push(url);
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401) {
          clearAuthStorage();
          setProjectStatus(index, { uploading: false, error: "Session expired. Please log in again." });
          return;
        }
        const message = err?.response?.data?.message || err?.message || "Upload failed";
        setProjectStatus(index, { uploading: false, error: message });
        return;
      }
    }

    if (uploadedUrls.length) {
      const nextValue = mergeMedia(resume.projects?.[index]?.media || "", uploadedUrls);
      updateListItem("projects", index, "media", nextValue);
    }
    setProjectStatus(index, { uploading: false, error: "" });
  };

  const handleProfileUpload = async (files) => {
    const file = Array.from(files || [])[0];
    if (!file) return;
    setProfileUpload({ uploading: true, error: "" });
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await api.post("/api/resume/media", form, {
        suppressAuthRedirect: true,
      });
      const url = res?.data?.mediaUrl || res?.data?.url || "";
      if (url) {
        updatePersonal("avatar", url);
      }
      setProfileUpload({ uploading: false, error: "" });
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) {
        clearAuthStorage();
        setProfileUpload({
          uploading: false,
          error: "Session expired. Please log in again.",
        });
        return;
      }
      const message = err?.response?.data?.message || err?.message || "Upload failed";
      setProfileUpload({ uploading: false, error: message });
    }
  };

  const viewCv = async () => {
    await saveResume(resume);
    navigate("/resume-templates?next=/job-profile");
  };

  const viewLabel = hydrated ? "View CV" : "Loading...";

  return (
    <div className="resume-builder-page">
      <div className="resume-builder-shell">
        <header className="resume-builder-header">
          <div>
            <div className="resume-builder-title">Profile</div>
            <div className="resume-builder-subtitle">
              Fill each section and generate a resume-style view.
            </div>
          </div>
          <button
            type="button"
            className="resume-builder-cta"
            onClick={viewCv}
            disabled={!hydrated}
          >
            {viewLabel}
          </button>
        </header>

        <div className="resume-builder-group-title">Sections</div>
        <div className="resume-builder-list">
          {coreSections.map((section, index) => {
            const isOpen = openSection === section.key;
            const filled = sectionStatus[section.key];
            return (
              <div
                key={section.key}
                className={`resume-section-card ${isOpen ? "open" : ""}`}
                style={{ "--index": index + 1 }}
              >
                <button
                  type="button"
                  className="resume-section-header"
                  onClick={() => toggleSection(section.key)}
                >
                  <span
                    className="resume-section-icon"
                    style={{ background: section.accent }}
                    aria-hidden="true"
                  >
                    {section.icon}
                  </span>
                  <span className="resume-section-text">
                    <span className="resume-section-title">{section.title}</span>
                    <span className="resume-section-subtitle">
                      {section.subtitle}
                    </span>
                  </span>
                  <span className={`resume-section-status ${filled ? "filled" : ""}`}>
                    {filled ? "Filled" : "Add"}
                  </span>
                </button>
                {isOpen && (
                  <div className="resume-section-body">
                    {section.key === "personal" && (
                      <div className="resume-field-grid">
                        <div className="resume-avatar-row">
                          <div className="resume-avatar-preview">
                            {resume.personal.avatar ? (
                              <img src={resume.personal.avatar} alt="Profile" />
                            ) : (
                              <span>Photo</span>
                            )}
                          </div>
                          <div className="resume-avatar-actions">
                            <label className="resume-upload">
                              <input name="resumebuilder-input-391"
                                type="file"
                                accept="image/*"
                                onChange={(event) => {
                                  const files = event.target.files;
                                  event.target.value = "";
                                  if (files && files.length) {
                                    handleProfileUpload(files);
                                  }
                                }}
                              />
                              Add Photo
                            </label>
                            {resume.personal.avatar && (
                              <button
                                type="button"
                                className="resume-avatar-remove"
                                onClick={() => updatePersonal("avatar", "")}
                              >
                                Remove
                              </button>
                            )}
                            {profileUpload.uploading && (
                              <span className="resume-upload-status">Uploading...</span>
                            )}
                          </div>
                          {profileUpload.error && (
                            <div className="resume-upload-error">{profileUpload.error}</div>
                          )}
                        </div>
                        <label className="resume-field">
                          <span>Full Name</span>
                          <input name="resumebuilder-input-423"
                            type="text"
                            value={resume.personal.fullName}
                            onChange={(event) =>
                              updatePersonal("fullName", event.target.value)
                            }
                            placeholder="Your full name"
                          />
                        </label>
                        <label className="resume-field">
                          <span>Headline</span>
                          <input name="resumebuilder-input-434"
                            type="text"
                            value={resume.personal.title}
                            onChange={(event) =>
                              updatePersonal("title", event.target.value)
                            }
                            placeholder="Role or title"
                          />
                        </label>
                        <label className="resume-field">
                          <span>Email</span>
                          <input name="resumebuilder-input-445"
                            type="email"
                            value={resume.personal.email}
                            onChange={(event) =>
                              updatePersonal("email", event.target.value)
                            }
                            placeholder="name@email.com"
                          />
                        </label>
                        <label className="resume-field">
                          <span>Phone</span>
                          <input name="resumebuilder-input-456"
                            type="tel"
                            value={resume.personal.phone}
                            onChange={(event) =>
                              updatePersonal("phone", event.target.value)
                            }
                            placeholder="+91 99999 99999"
                          />
                        </label>
                        <label className="resume-field">
                          <span>Location</span>
                          <input name="resumebuilder-input-467"
                            type="text"
                            value={resume.personal.location}
                            onChange={(event) =>
                              updatePersonal("location", event.target.value)
                            }
                            placeholder="City, Country"
                          />
                        </label>
                        <label className="resume-field">
                          <span>Website or LinkedIn</span>
                          <input name="resumebuilder-input-478"
                            type="text"
                            value={resume.personal.website}
                            onChange={(event) =>
                              updatePersonal("website", event.target.value)
                            }
                            placeholder="https://"
                          />
                        </label>
                      </div>
                    )}

                    {section.key === "education" && (
                      <div className="resume-list">
                        {resume.education.map((item, index) => (
                          <div className="resume-list-item" key={`edu-${index}`}>
                            <div className="resume-list-head">
                              <div>Education {index + 1}</div>
                              <button
                                type="button"
                                onClick={() => removeListItem("education", index)}
                                disabled={resume.education.length === 1}
                              >
                                Remove
                              </button>
                            </div>
                            <div className="resume-field-grid">
                              <label className="resume-field">
                                <span>Degree</span>
                                <input name="resumebuilder-input-507"
                                  type="text"
                                  value={item.degree}
                                  onChange={(event) =>
                                    updateListItem(
                                      "education",
                                      index,
                                      "degree",
                                      event.target.value
                                    )
                                  }
                                />
                              </label>
                              <label className="resume-field">
                                <span>Institution</span>
                                <input name="resumebuilder-input-522"
                                  type="text"
                                  value={item.school}
                                  onChange={(event) =>
                                    updateListItem(
                                      "education",
                                      index,
                                      "school",
                                      event.target.value
                                    )
                                  }
                                />
                              </label>
                              <label className="resume-field">
                                <span>Start</span>
                                <input name="resumebuilder-input-537"
                                  type="text"
                                  value={item.start}
                                  onChange={(event) =>
                                    updateListItem(
                                      "education",
                                      index,
                                      "start",
                                      event.target.value
                                    )
                                  }
                                />
                              </label>
                              <label className="resume-field">
                                <span>End</span>
                                <input name="resumebuilder-input-552"
                                  type="text"
                                  value={item.end}
                                  onChange={(event) =>
                                    updateListItem(
                                      "education",
                                      index,
                                      "end",
                                      event.target.value
                                    )
                                  }
                                />
                              </label>
                              <label className="resume-field full">
                                <span>Details</span>
                                <textarea name="resumebuilder-textarea-567"
                                  rows={3}
                                  value={item.details}
                                  onChange={(event) =>
                                    updateListItem(
                                      "education",
                                      index,
                                      "details",
                                      event.target.value
                                    )
                                  }
                                  placeholder="Highlights or coursework"
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="resume-add-btn"
                          onClick={() => addListItem("education")}
                        >
                          Add Education
                        </button>
                      </div>
                    )}

                    {section.key === "experience" && (
                      <div className="resume-list">
                        {resume.experience.map((item, index) => (
                          <div className="resume-list-item" key={`exp-${index}`}>
                            <div className="resume-list-head">
                              <div>Experience {index + 1}</div>
                              <button
                                type="button"
                                onClick={() => removeListItem("experience", index)}
                                disabled={resume.experience.length === 1}
                              >
                                Remove
                              </button>
                            </div>
                            <div className="resume-field-grid">
                              <label className="resume-field">
                                <span>Role</span>
                                <input name="resumebuilder-input-611"
                                  type="text"
                                  value={item.role}
                                  onChange={(event) =>
                                    updateListItem(
                                      "experience",
                                      index,
                                      "role",
                                      event.target.value
                                    )
                                  }
                                />
                              </label>
                              <label className="resume-field">
                                <span>Company</span>
                                <input name="resumebuilder-input-626"
                                  type="text"
                                  value={item.company}
                                  onChange={(event) =>
                                    updateListItem(
                                      "experience",
                                      index,
                                      "company",
                                      event.target.value
                                    )
                                  }
                                />
                              </label>
                              <label className="resume-field">
                                <span>Start</span>
                                <input name="resumebuilder-input-641"
                                  type="text"
                                  value={item.start}
                                  onChange={(event) =>
                                    updateListItem(
                                      "experience",
                                      index,
                                      "start",
                                      event.target.value
                                    )
                                  }
                                />
                              </label>
                              <label className="resume-field">
                                <span>End</span>
                                <input name="resumebuilder-input-656"
                                  type="text"
                                  value={item.end}
                                  onChange={(event) =>
                                    updateListItem(
                                      "experience",
                                      index,
                                      "end",
                                      event.target.value
                                    )
                                  }
                                />
                              </label>
                              <label className="resume-field full">
                                <span>Details</span>
                                <textarea name="resumebuilder-textarea-671"
                                  rows={3}
                                  value={item.details}
                                  onChange={(event) =>
                                    updateListItem(
                                      "experience",
                                      index,
                                      "details",
                                      event.target.value
                                    )
                                  }
                                  placeholder="Key responsibilities"
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="resume-add-btn"
                          onClick={() => addListItem("experience")}
                        >
                          Add Experience
                        </button>
                      </div>
                    )}

                    {section.key === "skills" && (
                      <div className="resume-field-stack">
                        <label className="resume-field">
                          <span>Skills</span>
                          <input name="resumebuilder-input-702"
                            type="text"
                            value={resume.skills}
                            onChange={(event) => updateField("skills", event.target.value)}
                            placeholder="React, Java, Spring Boot"
                          />
                        </label>
                        <div className="resume-hint">Separate skills with commas.</div>
                      </div>
                    )}

                    {section.key === "objective" && (
                      <label className="resume-field">
                        <span>Objective</span>
                        <textarea name="resumebuilder-textarea-716"
                          rows={4}
                          value={resume.objective}
                          onChange={(event) => updateField("objective", event.target.value)}
                          placeholder="Summarize your profile"
                        />
                      </label>
                    )}

                    {section.key === "reference" && (
                      <label className="resume-field">
                        <span>References</span>
                        <textarea name="resumebuilder-textarea-728"
                          rows={4}
                          value={resume.references}
                          onChange={(event) => updateField("references", event.target.value)}
                          placeholder="Name - Role - Contact"
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="resume-builder-group-title">More Sections</div>
        <div className="resume-builder-list">
          {moreSections.map((section, index) => {
            const isOpen = openSection === section.key;
            const filled = sectionStatus[section.key];
            return (
              <div
                key={section.key}
                className={`resume-section-card ${isOpen ? "open" : ""}`}
                style={{ "--index": index + 1 }}
              >
                <button
                  type="button"
                  className="resume-section-header"
                  onClick={() => toggleSection(section.key)}
                >
                  <span
                    className="resume-section-icon"
                    style={{ background: section.accent }}
                    aria-hidden="true"
                  >
                    {section.icon}
                  </span>
                  <span className="resume-section-text">
                    <span className="resume-section-title">{section.title}</span>
                    <span className="resume-section-subtitle">
                      {section.subtitle}
                    </span>
                  </span>
                  <span className={`resume-section-status ${filled ? "filled" : ""}`}>
                    {filled ? "Filled" : "Add"}
                  </span>
                </button>
                {isOpen && (
                  <div className="resume-section-body">
                    {section.key === "projects" && (
                      <div className="resume-list">
                        {resume.projects.map((item, index) => (
                          <div className="resume-list-item" key={`proj-${index}`}>
                            <div className="resume-list-head">
                              <div>Project {index + 1}</div>
                              <button
                                type="button"
                                onClick={() => removeListItem("projects", index)}
                                disabled={resume.projects.length === 1}
                              >
                                Remove
                              </button>
                            </div>
                            <div className="resume-field-grid">
                              <label className="resume-field">
                                <span>Name</span>
                                <input name="resumebuilder-input-795"
                                  type="text"
                                  value={item.name}
                                  onChange={(event) =>
                                    updateListItem(
                                      "projects",
                                      index,
                                      "name",
                                      event.target.value
                                    )
                                  }
                                />
                              </label>
                              <label className="resume-field full">
                                <span>Description</span>
                                <textarea name="resumebuilder-textarea-810"
                                  rows={3}
                                  value={item.description}
                                  onChange={(event) =>
                                    updateListItem(
                                      "projects",
                                      index,
                                      "description",
                                      event.target.value
                                    )
                                  }
                                />
                              </label>
                              <label className="resume-field full">
                                <span>Media URLs</span>
                                <textarea name="resumebuilder-textarea-825"
                                  rows={3}
                                  value={item.media || ""}
                                  onChange={(event) =>
                                    updateListItem(
                                      "projects",
                                      index,
                                      "media",
                                      event.target.value
                                    )
                                  }
                                  placeholder="Paste image/video links (comma or new line separated)"
                                />
                              </label>
                              <div className="resume-upload-row">
                                <label className="resume-upload">
                                  <input name="resumebuilder-input-841"
                                    type="file"
                                    accept="image/*,video/*"
                                    multiple
                                    onChange={(event) => {
                                      const files = event.target.files;
                                      event.target.value = "";
                                      if (files && files.length) {
                                        handleProjectMediaUpload(index, files);
                                      }
                                    }}
                                  />
                                  Add Images/Videos
                                </label>
                                {projectUploadState[index]?.uploading && (
                                  <span className="resume-upload-status">Uploading...</span>
                                )}
                              </div>
                              {projectUploadState[index]?.error && (
                                <div className="resume-upload-error">{projectUploadState[index].error}</div>
                              )}
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          className="resume-add-btn"
                          onClick={() => addListItem("projects")}
                        >
                          Add Project
                        </button>
                      </div>
                    )}

                    {section.key === "achievements" && (
                      <label className="resume-field">
                        <span>Achievements and Awards</span>
                        <textarea name="resumebuilder-textarea-878"
                          rows={4}
                          value={resume.achievements}
                          onChange={(event) => updateField("achievements", event.target.value)}
                          placeholder="List awards or milestones"
                        />
                      </label>
                    )}

                    {section.key === "coverLetter" && (
                      <label className="resume-field">
                        <span>Cover Letter</span>
                        <textarea name="resumebuilder-textarea-890"
                          rows={5}
                          value={resume.coverLetter}
                          onChange={(event) => updateField("coverLetter", event.target.value)}
                          placeholder="Write your cover letter"
                        />
                      </label>
                    )}

                    {section.key === "declaration" && (
                      <label className="resume-field">
                        <span>Declaration</span>
                        <textarea name="resumebuilder-textarea-902"
                          rows={4}
                          value={resume.declaration}
                          onChange={(event) => updateField("declaration", event.target.value)}
                          placeholder="Any declaration or consent statement"
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {resume.customSections.map((section, index) => {
            const key = `custom-${index}`;
            const isOpen = openSection === key;
            const isCustomFilled = isFilled(section.title) || isFilled(section.content);
            return (
              <div
                key={key}
                className={`resume-section-card ${isOpen ? "open" : ""}`}
                style={{ "--index": index + 1 }}
              >
                <button
                  type="button"
                  className="resume-section-header"
                  onClick={() => toggleSection(key)}
                >
                  <span className="resume-section-icon custom" aria-hidden="true">
                    CS
                  </span>
                  <span className="resume-section-text">
                    <span className="resume-section-title">
                      {section.title || `Custom Section ${index + 1}`}
                    </span>
                    <span className="resume-section-subtitle">Add any extra details</span>
                  </span>
                  <span
                    className={`resume-section-status ${isCustomFilled ? "filled" : ""}`}
                  >
                    {isCustomFilled ? "Filled" : "Add"}
                  </span>
                </button>
                {isOpen && (
                  <div className="resume-section-body">
                    <div className="resume-field-grid">
                      <label className="resume-field">
                        <span>Title</span>
                        <input name="resumebuilder-input-951"
                          type="text"
                          value={section.title}
                          onChange={(event) =>
                            updateListItem(
                              "customSections",
                              index,
                              "title",
                              event.target.value
                            )
                          }
                        />
                      </label>
                      <label className="resume-field full">
                        <span>Content</span>
                        <textarea name="resumebuilder-textarea-966"
                          rows={4}
                          value={section.content}
                          onChange={(event) =>
                            updateListItem(
                              "customSections",
                              index,
                              "content",
                              event.target.value
                            )
                          }
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      className="resume-remove-btn"
                      onClick={() => removeListItem("customSections", index, true)}
                    >
                      Remove Section
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          <button type="button" className="resume-add-card" onClick={addCustomSection}>
            Add More Section
          </button>
        </div>

        <button
          type="button"
          className="resume-builder-view"
          onClick={viewCv}
          disabled={!hydrated}
        >
          {viewLabel}
        </button>
      </div>
    </div>
  );
}
