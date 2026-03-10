import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Settings.css";

const formatTime = (value) => {
  if (!value) return "--";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "--";
  return d.toLocaleString();
};

export default function SettingsLocation() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState(null);

  const mapsUrl = useMemo(() => {
    const lat = position?.latitude;
    const lon = position?.longitude;
    if (typeof lat !== "number" || typeof lon !== "number") return "";
    return `https://www.google.com/maps?q=${lat},${lon}`;
  }, [position]);

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser.");
      return;
    }
    setLoading(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({
          latitude: pos?.coords?.latitude,
          longitude: pos?.coords?.longitude,
          accuracy: pos?.coords?.accuracy,
          altitude: pos?.coords?.altitude,
          speed: pos?.coords?.speed,
          heading: pos?.coords?.heading,
          capturedAt: Date.now()
        });
        setLoading(false);
      },
      (geoErr) => {
        const msg =
          geoErr?.code === 1
            ? "Location permission denied. Enable location permission for this site."
            : geoErr?.code === 2
            ? "Position unavailable. Please try again."
            : geoErr?.code === 3
            ? "Location request timed out. Please try again."
            : "Could not fetch location.";
        setError(msg);
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      }
    );
  };

  useEffect(() => {
    captureLocation();
  }, []);

  return (
    <div className="settings-page">
      <div className="settings-shell">
        <header className="settings-top">
          <button type="button" className="settings-back" onClick={() => navigate("/settings")}>
            {"<"}
          </button>
          <div>
            <h1>My Exact Location</h1>
            <p className="settings-subtitle">Live GPS coordinates from your device.</p>
          </div>
        </header>

        <section className="settings-panel">
          <header className="settings-panel-head">
            <h3>Location Details</h3>
            <button type="button" onClick={captureLocation} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </header>

          {error && <p className="settings-empty">{error}</p>}

          {!error && !position && <p className="settings-empty">Fetching location...</p>}

          {position && (
            <div className="settings-location-grid">
              <article className="settings-location-item">
                <small>Latitude</small>
                <strong>{position.latitude?.toFixed(7)}</strong>
              </article>
              <article className="settings-location-item">
                <small>Longitude</small>
                <strong>{position.longitude?.toFixed(7)}</strong>
              </article>
              <article className="settings-location-item">
                <small>Accuracy</small>
                <strong>{Math.round(position.accuracy || 0)} m</strong>
              </article>
              <article className="settings-location-item">
                <small>Captured At</small>
                <strong>{formatTime(position.capturedAt)}</strong>
              </article>
              <article className="settings-location-item">
                <small>Altitude</small>
                <strong>{position.altitude == null ? "--" : `${position.altitude.toFixed(1)} m`}</strong>
              </article>
              <article className="settings-location-item">
                <small>Speed</small>
                <strong>{position.speed == null ? "--" : `${position.speed.toFixed(2)} m/s`}</strong>
              </article>
              <article className="settings-location-item">
                <small>Heading</small>
                <strong>{position.heading == null ? "--" : `${Math.round(position.heading)}°`}</strong>
              </article>
              {mapsUrl && (
                <a className="settings-location-link" href={mapsUrl} target="_blank" rel="noreferrer">
                  Open in Google Maps
                </a>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
