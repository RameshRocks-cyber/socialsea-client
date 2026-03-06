import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import "./SOSNavigate.css";

export default function SOSNavigate() {
  const navigate = useNavigate();
  const { alertId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await api.get(`/api/emergency/${alertId}/assist`);
        if (!active) return;
        setPayload(res?.data || null);
      } catch (err) {
        if (!active) return;
        const status = err?.response?.status;
        if (status === 404) setError("SOS alert not found.");
        else if (status === 401 || status === 403) setError("Please login to view SOS navigation.");
        else setError("Unable to load SOS navigation details.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [alertId]);

  const mapsLink = useMemo(() => {
    if (payload?.mapsUrl) return payload.mapsUrl;
    if (payload?.latitude == null || payload?.longitude == null) return "";
    return `https://www.google.com/maps/dir/?api=1&destination=${payload.latitude},${payload.longitude}`;
  }, [payload]);

  return (
    <section className="sos-nav-page">
      <div className="sos-nav-card">
        <header className="sos-nav-head">
          <h1>Emergency Help Route</h1>
          <button type="button" onClick={() => navigate(-1)}>Back</button>
        </header>

        {loading && <p className="sos-nav-empty">Loading SOS details...</p>}
        {!loading && error && <p className="sos-nav-error">{error}</p>}

        {!loading && !error && payload && (
          <>
            <div className="sos-nav-grid">
              <p><strong>Alert ID:</strong> {payload.alertId}</p>
              <p><strong>Status:</strong> {payload.active ? "ACTIVE" : "ENDED"}</p>
              <p><strong>Latitude:</strong> {payload.latitude}</p>
              <p><strong>Longitude:</strong> {payload.longitude}</p>
            </div>

            <div className="sos-nav-actions">
              {payload.liveUrl && (
                <a className="sos-nav-btn live" href={payload.liveUrl}>
                  Open Live SOS
                </a>
              )}
              {mapsLink && (
                <a className="sos-nav-btn map" href={mapsLink} target="_blank" rel="noreferrer">
                  Open Navigation
                </a>
              )}
            </div>

            <iframe
              className="sos-nav-map"
              title="SOS location map"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://maps.google.com/maps?q=${payload.latitude},${payload.longitude}&z=15&output=embed`}
            />
          </>
        )}
      </div>
    </section>
  );
}
