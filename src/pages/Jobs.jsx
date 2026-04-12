import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAllJobs } from "../data/jobStore";
import { scoreJobForResume, buildResumeMatchProfile } from "../services/jobMatching";
import { recordSearchActivity } from "../services/activityStore";
import { readCompanyProfile } from "../services/companyProfileStore";
import { loadResume, readResumeSnapshot } from "../services/resumeStorage";
import "./JobPages.css";

const HIDDEN_TYPES_KEY = "hiddenJobTypes";
const RESUME_KEY = "socialsea_resume_snapshot_v1";

const parseList = (key) => {
  try {
    const raw = localStorage.getItem(key);
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

const Jobs = () => {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [hiddenTypes] = useState(() => parseList(HIDDEN_TYPES_KEY));
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const companyProfile = useMemo(() => readCompanyProfile(), []);
  const [resume, setResume] = useState(() => readResumeSnapshot());
  const [loadingResume, setLoadingResume] = useState(true);

  const allJobs = getAllJobs();
  const visibleJobs = allJobs.filter((job) => !hiddenTypes.includes(job.track));

  useEffect(() => {
    let mounted = true;

    const syncResume = async () => {
      const nextResume = await loadResume();
      if (!mounted) return;
      setResume(nextResume);
      setLoadingResume(false);
    };

    const handleStorage = (event) => {
      if (!event || event.key === RESUME_KEY) {
        setResume(readResumeSnapshot());
      }
    };

    syncResume();
    window.addEventListener("storage", handleStorage);
    return () => {
      mounted = false;
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const resumeProfile = useMemo(() => buildResumeMatchProfile(resume), [resume]);

  const scoredVisibleJobs = useMemo(
    () => visibleJobs.map((job) => scoreJobForResume(job, resumeProfile)),
    [visibleJobs, resumeProfile]
  );

  const filteredJobs = useMemo(() => {
    if (!normalizedQuery) return scoredVisibleJobs;
    return scoredVisibleJobs.filter((item) => {
      const job = item.job;
      const profileMatch =
        Boolean(companyProfile.companyId) &&
        companyProfile.companyId === job.companyId &&
        Boolean(companyProfile.name);
      const companyName = job.companyName || (profileMatch ? companyProfile.name : "");
      const haystack = [
        job.title,
        companyName,
        job.location,
        job.salary,
        job.experience,
        (job.skills || []).join(" ")
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [scoredVisibleJobs, normalizedQuery, companyProfile]);

  const applySearch = (event) => {
    event.preventDefault();
    setSearchQuery(searchInput);
    recordSearchActivity({ query: searchInput, source: "jobs" });
  };

  const openJob = (jobId) => {
    navigate(`/jobs/${jobId}`);
  };

  return (
    <div className="job-page job-list-page">
      <header className="job-page-header">
        <h1 className="job-page-title">Jobs</h1>
        <p className="job-page-subtitle">Company info</p>
        <div className="job-page-actions">
          <button type="button" className="job-page-edit" onClick={() => navigate("/applied-jobs")}>
            Applied Jobs
          </button>
        </div>
        <form className="job-list-search" onSubmit={applySearch}>
          <input
            type="search"
            placeholder="Search companies"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <button type="submit">Search</button>
        </form>
      </header>

      <div className="job-list">
        {filteredJobs.length === 0 ? (
          <p className="job-empty">No jobs available yet.</p>
        ) : (
          filteredJobs.map((item) => {
            const job = item.job;
            const profileMatch =
              Boolean(companyProfile.companyId) &&
              companyProfile.companyId === job.companyId &&
              Boolean(companyProfile.name);
            const companyName =
              job.companyName || (profileMatch ? companyProfile.name : "") || "Company";
            return (
            <div
              key={job.id}
              className="job-list-row"
              role="button"
              tabIndex={0}
              onClick={() => openJob(job.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openJob(job.id);
                }
              }}
            >
              <div className="job-list-main">
                <div className="job-list-role">Role: {job.title}</div>
                <div className="job-list-meta">
                  <span>Salary: {job.salary}</span>
                  <span>Experience: {job.experience}</span>
                </div>
                <div className="job-pill-row">
                  <span className="job-pill job-pill-accent">
                    {item.matchPercentage}% match
                  </span>
                  <span className="job-pill">
                    {item.chancePercentage}% chance
                  </span>
                  {!loadingResume && (
                    <span className="job-pill">{item.resumeStrengthPercentage}% profile strength</span>
                  )}
                </div>
                <div className="job-list-skills">
                  Required skills: {(job.skills || []).join(", ")}
                </div>
              </div>
              <div className="job-list-company">
                <div className="job-list-company-label">Company</div>
                {profileMatch ? (
                  <Link
                    to={`/companies/${job.companyId}`}
                    className="job-list-company-name"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {companyName}
                  </Link>
                ) : (
                  <span className="job-list-company-name">{companyName}</span>
                )}
              </div>
            </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Jobs;
