import { Link, useNavigate, useParams } from "react-router-dom";
import { getJobsByCompanyId } from "../data/jobStore";
import { readCompanyProfile } from "../services/companyProfileStore";
import "./CompanyProfile.css";

const CompanyProfile = () => {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const profile = readCompanyProfile();
  const hasProfile = Boolean(profile.name);
  const matchesId = Boolean(profile.companyId && companyId === profile.companyId);

  if (!hasProfile || !matchesId) {
    return (
      <div className="company-profile-page">
        <div className="company-profile-card">
          <h2>Company not found</h2>
          <p>We could not find this company profile.</p>
          <button type="button" className="company-profile-link" onClick={() => navigate("/company-hub")}>
            Back to Company Hub
          </button>
        </div>
      </div>
    );
  }

  const openRoles = getJobsByCompanyId(profile.companyId);

  return (
    <div className="company-profile-page">
      <div className="company-profile-hero">
        <div className="company-profile-identity">
          <div className="company-profile-logo">
            {profile.logoUrl ? (
              <img src={profile.logoUrl} alt="Company logo" />
            ) : (
              <span>Logo</span>
            )}
          </div>
          <div>
            <h2>{profile.name}</h2>
            <p className="company-profile-subtitle">
              {[profile.industry, profile.location].filter(Boolean).join(" • ") || "Company profile"}
            </p>
          </div>
        </div>
        <div className="company-profile-actions">
          <button type="button" onClick={() => navigate("/post-job?mode=profile")}>Edit Profile</button>
          <button type="button" onClick={() => navigate("/company-hub")}>Company Hub</button>
        </div>
      </div>

      <section className="company-profile-section">
        <h3>Company Overview</h3>
        <p>{profile.overview || "Add your company overview."}</p>
      </section>

      <section className="company-profile-section">
        <h3>What We Do</h3>
        <p>{profile.whatWeDo || "Describe the work your company does."}</p>
      </section>

      <section className="company-profile-section">
        <h3>Key Features</h3>
        {profile.features.length ? (
          <div className="company-profile-chips">
            {profile.features.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        ) : (
          <p className="company-profile-muted">No features added yet.</p>
        )}
      </section>

      <section className="company-profile-section">
        <h3>Clients</h3>
        {profile.clients.length ? (
          <div className="company-profile-chips">
            {profile.clients.map((client) => (
              <span key={client}>{client}</span>
            ))}
          </div>
        ) : (
          <p className="company-profile-muted">No clients listed.</p>
        )}
      </section>

      <section className="company-profile-section">
        <h3>Services</h3>
        {profile.services.length ? (
          <div className="company-profile-chips">
            {profile.services.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        ) : (
          <p className="company-profile-muted">No services added.</p>
        )}
      </section>

      <section className="company-profile-section">
        <h3>Open Roles</h3>
        {openRoles.length === 0 ? (
          <p className="company-profile-muted">No open roles right now.</p>
        ) : (
          <div className="company-profile-roles">
            {openRoles.map((role) => (
              <Link key={role.id} to={`/jobs/${role.id}`} className="company-profile-role">
                <div>
                  <div className="company-profile-role-title">{role.title}</div>
                  <div className="company-profile-role-subtitle">
                    {role.location} • {role.salary}
                  </div>
                </div>
                <span className="company-profile-role-arrow">View</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default CompanyProfile;
