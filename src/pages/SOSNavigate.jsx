import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import "./SOSNavigate.css";

const SOS_NAV_CACHE_KEY = "socialsea_sos_nav_cache_v1";

const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const normalizeLiveUrl = (rawUrl, fallbackAlertId = "") => {
  const raw = String(rawUrl || "").trim();
  const fallbackId = String(fallbackAlertId || "").trim();
  const appOrigin = typeof window !== "undefined" ? String(window.location.origin || "").replace(/\/+$/, "") : "";

  const toLivePath = (id) => {
    const safeId = String(id || "").trim();
    if (!safeId) return "";
    const path = `/sos/live/${encodeURIComponent(safeId)}`;
    return appOrigin ? `${appOrigin}${path}` : path;
  };

  if (!raw) return toLivePath(fallbackId);

  try {
    const parsed = new URL(raw, appOrigin || "http://localhost");
    const liveMatch = parsed.pathname.match(/\/sos\/live\/([^/?#]+)/i);
    if (liveMatch?.[1]) return toLivePath(decodeURIComponent(liveMatch[1]));

    const genericSosMatch = parsed.pathname.match(/\/sos\/(?!navigate\/)([^/?#]+)/i);
    if (genericSosMatch?.[1]) return toLivePath(decodeURIComponent(genericSosMatch[1]));
  } catch {
    // keep original URL if parsing fails
  }

  return raw;
};

export default function SOSNavigate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { alertId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [myLocation, setMyLocation] = useState(null);

  useEffect(() => {
    let active = true;

    const fallbackFromSearchAndCache = () => {
      const queryLat = toFiniteNumber(searchParams.get("lat"));
      const queryLon = toFiniteNumber(searchParams.get("lon"));
      const queryReporter = String(searchParams.get("reporter") || "").trim();
      const queryLive = String(searchParams.get("live") || "").trim();
      const queryMaps = String(searchParams.get("maps") || "").trim();

      if (queryLat != null && queryLon != null) {
        return {
          alertId: alertId || "active",
          active: true,
          latitude: queryLat,
          longitude: queryLon,
          reporterEmail: queryReporter || null,
          liveUrl: normalizeLiveUrl(queryLive, alertId || "active") || null,
          mapsUrl: queryMaps || null,
          source: "query"
        };
      }

      try {
        const raw = localStorage.getItem(SOS_NAV_CACHE_KEY);
        const cache = raw ? JSON.parse(raw) : {};
        const cached = cache?.[String(alertId || "").trim()];
        const cachedLat = toFiniteNumber(cached?.latitude);
        const cachedLon = toFiniteNumber(cached?.longitude);
        if (cachedLat != null && cachedLon != null) {
          return {
            alertId: cached?.alertId || alertId || "active",
            active: true,
            latitude: cachedLat,
            longitude: cachedLon,
            reporterEmail: cached?.reporterEmail || null,
            liveUrl: normalizeLiveUrl(cached?.liveUrl, cached?.alertId || alertId || "active") || null,
            mapsUrl: cached?.mapsUrl || null,
            source: "cache"
          };
        }
      } catch {
        // ignore storage issues
      }
      return null;
    };

    const load = async () => {
      setLoading(true);
      setError("");
      const isNumericAlertId = /^\d+$/.test(String(alertId || "").trim());
      try {
        if (!isNumericAlertId) {
          const fallback = fallbackFromSearchAndCache();
          if (!active) return;
          if (fallback) {
            setPayload(fallback);
          } else {
            setError("SOS location is unavailable.");
          }
          return;
        }

        const res = await api.get(`/api/emergency/${alertId}/assist`);
        if (!active) return;
        const data = res?.data || null;
        if (!data) {
          setError("SOS location is unavailable.");
          return;
        }
        setPayload({
          ...data,
          liveUrl: normalizeLiveUrl(data?.liveUrl || data?.streamUrl, data?.alertId || alertId)
        });
      } catch (err) {
        if (!active) return;
        const fallback = fallbackFromSearchAndCache();
        if (fallback) {
          setPayload(fallback);
          setError("");
          return;
        }

        const status = Number(err?.response?.status || 0);
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
  }, [alertId, searchParams]);

  useEffect(() => {
    let cancelled = false;
    if (!navigator.geolocation) return undefined;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        setMyLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const mapsLink = useMemo(() => {
    if (payload?.mapsUrl) return payload.mapsUrl;
    if (payload?.latitude == null || payload?.longitude == null) return "";
    const destination = `${payload.latitude},${payload.longitude}`;
    const origin =
      myLocation?.latitude != null && myLocation?.longitude != null
        ? `&origin=${myLocation.latitude},${myLocation.longitude}`
        : "";
    return `https://www.google.com/maps/dir/?api=1&destination=${destination}${origin}&travelmode=driving`;
  }, [payload, myLocation]);

  const distanceText = useMemo(() => {
    if (!payload || payload?.latitude == null || payload?.longitude == null || !myLocation) return "";
    const meters = haversineMeters(myLocation.latitude, myLocation.longitude, payload.latitude, payload.longitude);
    if (!Number.isFinite(meters)) return "";
    if (meters < 1000) return `${Math.round(meters)} m away`;
    return `${(meters / 1000).toFixed(2)} km away`;
  }, [payload, myLocation]);

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
              <p><strong>Reporter:</strong> {payload.reporterEmail || "-"}</p>
              <p><strong>Latitude:</strong> {payload.latitude}</p>
              <p><strong>Longitude:</strong> {payload.longitude}</p>
              <p><strong>Your distance:</strong> {distanceText || "Locating..."}</p>
            </div>

            <div className="sos-nav-actions">
              {payload.liveUrl && (
                <a className="sos-nav-btn live" href={payload.liveUrl}>
                  Open Live SOS
                </a>
              )}
              {mapsLink && (
                <a className="sos-nav-btn map" href={mapsLink} target="_blank" rel="noreferrer">
                  Start Navigation
                </a>
              )}
            </div>

            <iframe
              className="sos-nav-map"
              title="SOS location map"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://maps.google.com/maps?q=${payload.latitude},${payload.longitude}&z=16&output=embed`}
            />
          </>
        )}
      </div>
    </section>
  );
}
