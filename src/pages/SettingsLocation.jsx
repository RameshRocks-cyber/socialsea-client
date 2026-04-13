import { useEffect, useMemo, useRef, useState } from "react";
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
  const requestIdRef = useRef(0);

  const mapsUrl = useMemo(() => {
    const lat = position?.latitude;
    const lon = position?.longitude;
    if (typeof lat !== "number" || typeof lon !== "number") return "";
    return `https://www.google.com/maps?q=${lat},${lon}`;
  }, [position]);

  const captureLocation = async () => {
    const geo = navigator.geolocation;
    if (!geo) {
      setError("Geolocation is not supported in this browser.");
      return;
    }
    if (!window.isSecureContext) {
      setError("Location requires HTTPS. Please open the site using https://");
      return;
    }

    const requestId = (requestIdRef.current += 1);
    const setIfCurrent = (fn) => {
      if (requestIdRef.current !== requestId) return;
      fn();
    };

    const toMessage = (geoErr) => {
      const code = Number(geoErr?.code || 0);
      if (code === 1) return "Location permission denied. Enable location permission for this site.";
      if (code === 2) return "Position unavailable. Turn on device location and try again.";
      if (code === 3) return "Location request timed out. Turn on GPS/Location and try again.";
      return "Could not fetch location.";
    };

    const requestPosition = (options) =>
      new Promise((resolve, reject) => {
        geo.getCurrentPosition(resolve, reject, options);
      });

    const applyPosition = (pos) => {
      const next = {
        latitude: pos?.coords?.latitude,
        longitude: pos?.coords?.longitude,
        accuracy: pos?.coords?.accuracy,
        altitude: pos?.coords?.altitude,
        speed: pos?.coords?.speed,
        heading: pos?.coords?.heading,
        capturedAt: Date.now()
      };
      setIfCurrent(() => setPosition(next));
      return next;
    };

    setIfCurrent(() => {
      setLoading(true);
      setError("");
    });

    // More reliable in production: allow a cached/network location first, then refine with GPS.
    const fastOptions = { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 };
    const preciseOptions = { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 };

    let best = null;
    let lastErr = null;

    try {
      const pos = await requestPosition(fastOptions);
      best = applyPosition(pos);
      setIfCurrent(() => setLoading(false));
    } catch (err) {
      lastErr = err;
      if (Number(err?.code) === 1) {
        setIfCurrent(() => {
          setError(toMessage(err));
          setLoading(false);
        });
        return;
      }
    }

    try {
      const pos = await requestPosition(preciseOptions);
      const next = {
        latitude: pos?.coords?.latitude,
        longitude: pos?.coords?.longitude,
        accuracy: pos?.coords?.accuracy,
        altitude: pos?.coords?.altitude,
        speed: pos?.coords?.speed,
        heading: pos?.coords?.heading,
        capturedAt: Date.now()
      };
      const nextAccuracy = typeof next.accuracy === "number" ? next.accuracy : null;
      const bestAccuracy = typeof best?.accuracy === "number" ? best.accuracy : null;
      if (!best || (nextAccuracy != null && bestAccuracy != null && nextAccuracy < bestAccuracy)) {
        setIfCurrent(() => setPosition(next));
        best = next;
      }
    } catch (err) {
      lastErr = err;
      if (!best) setIfCurrent(() => setError(toMessage(err)));
    } finally {
      setIfCurrent(() => setLoading(false));
    }

    if (!best && lastErr) {
      setIfCurrent(() => setError(toMessage(lastErr)));
    }
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
