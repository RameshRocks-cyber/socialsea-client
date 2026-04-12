import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./AmbulanceNavigation.css";

const DEFAULT_RADIUS_METERS = 500;
const ALERT_COOLDOWN_MS = 60 * 1000;
const SLOW_SPEED_KMH = 6;
const SLOW_TRIGGER_MS = 18 * 1000;
const ROUTE_AHEAD_METERS = 500;
const DEFAULT_MAP_ZOOM = 15;
const DEFAULT_CENTER = { lat: 17.385, lng: 78.4867 };
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const buildProblemIcon = () =>
  L.divIcon({
    className: "ambulance-problem-icon",
    html: '<div class="ambulance-problem-tri"></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const parseLatLngFromText = (rawText) => {
  const text = String(rawText || "").trim();
  if (!text) return null;

  const candidates = [];

  const push = (lat, lng) => {
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
    if (la < -90 || la > 90) return;
    if (lo < -180 || lo > 180) return;
    candidates.push({ lat: la, lng: lo });
  };

  let m = text.match(/(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (m) push(m[1], m[2]);

  m = text.match(/@(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (m) push(m[1], m[2]);

  m = text.match(/[?&]q=(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (m) push(m[1], m[2]);

  m = text.match(/[?&]destination=(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (m) push(m[1], m[2]);

  m = text.match(/!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/);
  if (m) push(m[1], m[2]);

  return candidates[0] || null;
};

const isGoogleMapsLink = (rawText) => {
  const text = String(rawText || "").trim();
  if (!text) return false;
  if (!/^https?:\/\//i.test(text)) return false;
  return /(maps\.app\.goo\.gl|goo\.gl\/maps|google\.com\/maps|maps\.google\.com)/i.test(text);
};

const buildDestinationMapsUrl = ({ destinationLat, destinationLng, originLat, originLng }) => {
  const dest =
    destinationLat != null && destinationLng != null ? `${destinationLat},${destinationLng}` : "";
  if (!dest) return "";
  const origin =
    originLat != null && originLng != null ? `&origin=${originLat},${originLng}` : "";
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}${origin}&travelmode=driving`;
};

const buildSpotMapsUrl = (point) => {
  const lat = point?.lat;
  const lng = point?.lng;
  if (lat == null || lng == null) return "";
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
};

const getActiveFullscreenElement = () => {
  if (typeof document === "undefined") return null;
  return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
};

const requestBrowserFullscreen = async (element) => {
  if (!element) return false;
  try {
    if (typeof element.requestFullscreen === "function") {
      await element.requestFullscreen();
      return true;
    }
    if (typeof element.webkitRequestFullscreen === "function") {
      element.webkitRequestFullscreen();
      return true;
    }
    if (typeof element.msRequestFullscreen === "function") {
      element.msRequestFullscreen();
      return true;
    }
  } catch {
    return false;
  }
  return false;
};

const exitBrowserFullscreen = async () => {
  if (typeof document === "undefined") return false;
  try {
    if (typeof document.exitFullscreen === "function") {
      await document.exitFullscreen();
      return true;
    }
    if (typeof document.webkitExitFullscreen === "function") {
      document.webkitExitFullscreen();
      return true;
    }
    if (typeof document.msExitFullscreen === "function") {
      document.msExitFullscreen();
      return true;
    }
  } catch {
    return false;
  }
  return false;
};

const formatMeters = (value) => {
  const meters = Number(value) || 0;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
};

const formatDuration = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
};

const normalizeStepLabel = (step) => {
  const name = String(step?.name || "").trim();
  const man = step?.maneuver || {};
  const type = String(man?.type || "").trim();
  const modifier = String(man?.modifier || "").trim();

  const road = name ? ` on ${name}` : "";
  if (!type) {
    return road ? `Continue${road}` : "Continue";
  }
  if (type === "depart") return road ? `Start${road}` : "Start";
  if (type === "arrive") return "Arrive at destination";
  if (type === "roundabout") return road ? `Enter roundabout${road}` : "Enter roundabout";
  if (type === "merge") return road ? `Merge${road}` : "Merge";
  if (type === "fork") return road ? `Fork ${modifier}${road}`.trim() : `Fork ${modifier}`.trim();
  if (type === "end of road") return road ? `End of road${road}` : "End of road";
  if (type === "turn") {
    const mod = modifier ? ` ${modifier}` : "";
    return `Turn${mod}${road}`.trim();
  }
  return `${type}${modifier ? ` ${modifier}` : ""}${road}`.trim();
};

const computeAheadPoint = (routeCoords, current, aheadMeters) => {
  if (!Array.isArray(routeCoords) || routeCoords.length < 2) return null;
  if (!current) return null;
  const { lat, lng } = current;
  if (lat == null || lng == null) return null;

  let nearestIndex = 0;
  let nearestDistance = Infinity;
  for (let i = 0; i < routeCoords.length; i += 1) {
    const [lon, la] = routeCoords[i] || [];
    if (la == null || lon == null) continue;
    const d = haversineMeters(lat, lng, la, lon);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearestIndex = i;
    }
  }

  let remaining = Math.max(0, aheadMeters);
  for (let i = nearestIndex; i < routeCoords.length - 1; i += 1) {
    const [lon1, lat1] = routeCoords[i] || [];
    const [lon2, lat2] = routeCoords[i + 1] || [];
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) continue;
    const seg = haversineMeters(lat1, lon1, lat2, lon2);
    if (seg <= 0) continue;
    if (remaining > seg) {
      remaining -= seg;
      continue;
    }
    const t = clamp(remaining / seg, 0, 1);
    const nextLat = lat1 + (lat2 - lat1) * t;
    const nextLng = lon1 + (lon2 - lon1) * t;
    return { lat: nextLat, lng: nextLng };
  }

  const [lastLon, lastLat] = routeCoords[routeCoords.length - 1] || [];
  if (lastLat == null || lastLon == null) return null;
  return { lat: lastLat, lng: lastLon };
};

export default function AmbulanceNavigation() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const [approved, setApproved] = useState(false);
  const [latestRequest, setLatestRequest] = useState(null);

  const [requestForm, setRequestForm] = useState({
    driverName: "",
    phone: "",
    vehicleNumber: "",
    serviceName: "",
    note: ""
  });
  const [requestBusy, setRequestBusy] = useState(false);

  const [destinationInput, setDestinationInput] = useState("");
  const [destinationLabel, setDestinationLabel] = useState("");
  const [destinationLatLng, setDestinationLatLng] = useState(null);
  const [tripActive, setTripActive] = useState(false);
  const [tripBusy, setTripBusy] = useState(false);
  const [mapFullscreenMode, setMapFullscreenMode] = useState("off");

  const [myLocation, setMyLocation] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [routeError, setRouteError] = useState("");
  const [routeLoading, setRouteLoading] = useState(false);
  const [resolveBusy, setResolveBusy] = useState(false);
  const [followMode, setFollowMode] = useState(true);

  const [slowWarning, setSlowWarning] = useState("");
  const [lastAlert, setLastAlert] = useState(null);
  const [alertBusy, setAlertBusy] = useState(false);
  const [lastNotifiedCount, setLastNotifiedCount] = useState(null);

  const slowStartRef = useRef(0);
  const lastAlertAtRef = useRef(0);
  const prevPosRef = useRef(null);

  const mapElRef = useRef(null);
  const mapWrapRef = useRef(null);
  const mapRef = useRef(null);
  const myMarkerRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const problemMarkerRef = useRef(null);
  const routeLineRef = useRef(null);
  const radiusCircleRef = useRef(null);
  const hasFitRouteRef = useRef(false);
  const problemIconRef = useRef(null);
  const mapFullscreen = mapFullscreenMode !== "off";

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setNotice("");
      try {
        const res = await api.get("/api/ambulance/me", { suppressAuthRedirect: true, timeout: 8000 });
        if (!active) return;
        const data = res?.data || {};
        setApproved(Boolean(data?.approved));
        setLatestRequest(data?.request || null);
      } catch (err) {
        if (!active) return;
        const status = err?.response?.status;
        if (status === 404) {
          setNotice("Ambulance API not found. Restart backend and refresh this page.");
        } else {
          setNotice(status === 401 || status === 403 ? "Please login again." : "Unable to load ambulance access status.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const parsed = parseLatLngFromText(destinationInput);
    setDestinationLatLng(parsed);
  }, [destinationInput]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const syncFullscreenState = () => {
      const activeElement = getActiveFullscreenElement();
      if (
        activeElement &&
        mapWrapRef.current &&
        (activeElement === mapWrapRef.current || mapWrapRef.current.contains(activeElement))
      ) {
        setMapFullscreenMode("native");
      } else {
        setMapFullscreenMode((current) => (current === "native" ? "off" : current));
      }

      setTimeout(() => {
        try {
          mapRef.current?.invalidateSize();
        } catch {
          // ignore
        }
      }, 80);
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);
    document.addEventListener("MSFullscreenChange", syncFullscreenState);

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState);
      document.removeEventListener("MSFullscreenChange", syncFullscreenState);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (mapFullscreenMode !== "fallback") return undefined;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMapFullscreenMode("off");
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mapFullscreenMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    const timer = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {
        // ignore
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [mapFullscreen]);

  useEffect(() => {
    if (!approved) return undefined;
    const el = mapElRef.current;
    if (!el) return undefined;
    if (mapRef.current) return undefined;

    const map = L.map(el, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true
    });

    L.control.zoom({ position: "topright" }).addTo(map);
    L.control.attribution({ position: "topleft" }).addTo(map);
    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 19
    }).addTo(map);

    map.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], DEFAULT_MAP_ZOOM);
    mapRef.current = map;
    problemIconRef.current = buildProblemIcon();

    setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {
        // ignore
      }
    }, 0);

    return () => {
      try {
        map.remove();
      } catch {
        // ignore
      }
      mapRef.current = null;
      myMarkerRef.current = null;
      destinationMarkerRef.current = null;
      problemMarkerRef.current = null;
      routeLineRef.current = null;
      radiusCircleRef.current = null;
      hasFitRouteRef.current = false;
      problemIconRef.current = null;
    };
  }, [approved]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !approved) return;

    const lat = myLocation?.lat;
    const lng = myLocation?.lng;
    if (lat == null || lng == null) return;

    const pos = [lat, lng];
    if (!myMarkerRef.current) {
      myMarkerRef.current = L.circleMarker(pos, {
        radius: 7,
        color: "#50aaff",
        weight: 3,
        fillColor: "#50aaff",
        fillOpacity: 0.95
      }).addTo(map);
    } else {
      myMarkerRef.current.setLatLng(pos);
    }

    if (followMode) {
      const nextZoom = Math.max(map.getZoom() || DEFAULT_MAP_ZOOM, DEFAULT_MAP_ZOOM);
      map.setView(pos, nextZoom, { animate: true });
    }
  }, [approved, myLocation, followMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !approved) return;

    if (!destinationLatLng?.lat || !destinationLatLng?.lng) {
      if (destinationMarkerRef.current) {
        map.removeLayer(destinationMarkerRef.current);
        destinationMarkerRef.current = null;
      }
      return;
    }

    const pos = [destinationLatLng.lat, destinationLatLng.lng];
    if (!destinationMarkerRef.current) {
      destinationMarkerRef.current = L.circleMarker(pos, {
        radius: 7,
        color: "#ff5858",
        weight: 3,
        fillColor: "#ff5858",
        fillOpacity: 0.95
      }).addTo(map);
    } else {
      destinationMarkerRef.current.setLatLng(pos);
    }
  }, [approved, destinationLatLng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !approved) return;

    const coords = routeInfo?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      if (routeLineRef.current) {
        map.removeLayer(routeLineRef.current);
        routeLineRef.current = null;
      }
      hasFitRouteRef.current = false;
      return;
    }

    const latlngs = coords
      .map((pt) => {
        const lon = pt?.[0];
        const la = pt?.[1];
        if (la == null || lon == null) return null;
        return [la, lon];
      })
      .filter(Boolean);

    if (!latlngs.length) return;

    if (!routeLineRef.current) {
      routeLineRef.current = L.polyline(latlngs, {
        color: "#00ffd5",
        weight: 6,
        opacity: 0.9
      }).addTo(map);
    } else {
      routeLineRef.current.setLatLngs(latlngs);
    }

    if (!hasFitRouteRef.current && !followMode) {
      try {
        map.fitBounds(routeLineRef.current.getBounds(), { padding: [24, 24] });
        hasFitRouteRef.current = true;
      } catch {
        // ignore
      }
    }
  }, [approved, routeInfo, followMode]);

  const resolveDestination = async () => {
    if (resolveBusy) return null;
    const url = String(destinationInput || "").trim();
    if (!isGoogleMapsLink(url)) return null;

    setResolveBusy(true);
    setNotice("Resolving Google Maps link...");
    try {
      const res = await api.post("/api/ambulance/resolve", { url }, { timeout: 12000 });
      const data = res?.data || {};
      const lat = toFiniteNumber(data?.lat);
      const lng = toFiniteNumber(data?.lng);
      if (lat == null || lng == null) {
        setNotice("Could not detect coordinates from this link. Try pasting 'lat,lng'.");
        return null;
      }
      const coords = { lat, lng };
      setDestinationLatLng(coords);
      return coords;
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setNotice("Please login again.");
      } else if (status === 422) {
        setNotice("Could not detect coordinates from this link. Open it and copy full URL (with @lat,lng), or paste 'lat,lng'.");
      } else if (status === 404) {
        setNotice("Ambulance API not found. Restart backend and try again.");
      } else {
        setNotice("Unable to resolve link right now.");
      }
      return null;
    } finally {
      setResolveBusy(false);
    }
  };

  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    let cancelled = false;

    const onPos = (pos) => {
      if (cancelled) return;
      const next = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        at: Date.now()
      };

      // compute speed km/h
      const prev = prevPosRef.current;
      let speedKmh = null;
      if (typeof pos.coords.speed === "number" && Number.isFinite(pos.coords.speed)) {
        speedKmh = Math.max(0, pos.coords.speed) * 3.6;
      } else if (prev?.lat != null && prev?.lng != null && prev?.at) {
        const dt = Math.max(1, next.at - prev.at);
        const meters = haversineMeters(prev.lat, prev.lng, next.lat, next.lng);
        speedKmh = (meters / (dt / 1000)) * 3.6;
      }
      next.speedKmh = speedKmh;
      prevPosRef.current = next;
      setMyLocation(next);
    };

    const watchId = navigator.geolocation.watchPosition(onPos, () => {}, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 5000
    });
    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const destinationMapsUrl = useMemo(
    () =>
      buildDestinationMapsUrl({
        destinationLat: destinationLatLng?.lat,
        destinationLng: destinationLatLng?.lng,
        originLat: myLocation?.lat,
        originLng: myLocation?.lng
      }),
    [destinationLatLng, myLocation]
  );

  const problemSpot = useMemo(() => {
    const coords = routeInfo?.geometry?.coordinates;
    const current = myLocation?.lat != null && myLocation?.lng != null ? { lat: myLocation.lat, lng: myLocation.lng } : null;
    return computeAheadPoint(coords, current, ROUTE_AHEAD_METERS);
  }, [routeInfo, myLocation]);

  const problemSpotUrl = useMemo(() => buildSpotMapsUrl(problemSpot), [problemSpot]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !approved) return;

    if (!problemSpot?.lat || !problemSpot?.lng) {
      if (problemMarkerRef.current) {
        map.removeLayer(problemMarkerRef.current);
        problemMarkerRef.current = null;
      }
      if (radiusCircleRef.current) {
        map.removeLayer(radiusCircleRef.current);
        radiusCircleRef.current = null;
      }
      return;
    }

    const pos = [problemSpot.lat, problemSpot.lng];
    const icon = problemIconRef.current || buildProblemIcon();

    if (!problemMarkerRef.current) {
      problemMarkerRef.current = L.marker(pos, {
        icon,
        interactive: false
      }).addTo(map);
    } else {
      problemMarkerRef.current.setLatLng(pos);
    }

    if (!radiusCircleRef.current) {
      radiusCircleRef.current = L.circle(pos, {
        radius: DEFAULT_RADIUS_METERS,
        color: "rgba(255, 209, 74, 0.9)",
        weight: 2,
        fillColor: "rgba(255, 209, 74, 0.25)",
        fillOpacity: 0.25
      }).addTo(map);
    } else {
      radiusCircleRef.current.setLatLng(pos);
      radiusCircleRef.current.setRadius(DEFAULT_RADIUS_METERS);
    }
  }, [approved, problemSpot]);

  const requestApproval = async () => {
    if (requestBusy) return;
    setNotice("");
    setRequestBusy(true);
    try {
      const res = await api.post("/api/ambulance/request", requestForm, { timeout: 12000 });
      const data = res?.data || {};
      setApproved(Boolean(data?.approved));
      setLatestRequest(data?.request || null);
      setNotice("Request submitted. Waiting for admin approval.");
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404) {
        setNotice("Ambulance API not found. Restart backend and try again.");
      } else if (status === 401 || status === 403) {
        setNotice("Please login again.");
      } else if (status >= 500) {
        setNotice("Server error while submitting request.");
      } else {
        setNotice("Unable to submit request.");
      }
    } finally {
      setRequestBusy(false);
    }
  };

  const loadRoute = async ({ origin, destination }) => {
    if (!origin || !destination) return null;
    setRouteLoading(true);
    setRouteError("");
    try {
      const url =
        "https://router.project-osrm.org/route/v1/driving/" +
        `${origin.lng},${origin.lat};${destination.lng},${destination.lat}` +
        "?overview=full&geometries=geojson&steps=true";
      const res = await fetch(url);
      if (!res.ok) throw new Error("OSRM route fetch failed");
      const data = await res.json();
      const route = Array.isArray(data?.routes) ? data.routes[0] : null;
      if (!route) throw new Error("No route found");
      const leg = Array.isArray(route?.legs) ? route.legs[0] : null;
      const steps = Array.isArray(leg?.steps) ? leg.steps : [];
      return {
        distance: route.distance,
        duration: route.duration,
        geometry: route.geometry,
        steps
      };
    } catch (err) {
      setRouteError("Could not load route. Check destination coordinates and internet.");
      return null;
    } finally {
      setRouteLoading(false);
    }
  };

  const startTrip = async () => {
    setNotice("");
    setSlowWarning("");
    setLastNotifiedCount(null);
    setLastAlert(null);
    if (tripBusy) return;

    let destination = destinationLatLng || parseLatLngFromText(destinationInput);
    if (!destination && isGoogleMapsLink(destinationInput)) {
      destination = await resolveDestination();
    }
    if (!destination) {
      setNotice("Paste hospital location as 'lat,lng' or a Google Maps link.");
      return;
    }
    if (!myLocation?.lat || !myLocation?.lng) {
      setNotice("Turn on location to start trip.");
      return;
    }
    setTripBusy(true);
    try {
      await api.post(
        "/api/ambulance/trip/start",
        {
          destinationLabel: destinationLabel.trim(),
          destinationLat: destination.lat,
          destinationLng: destination.lng
        },
        { timeout: 12000 }
      );
    } catch {
      // admin notify is best-effort
    }

    const route = await loadRoute({
      origin: { lat: myLocation.lat, lng: myLocation.lng },
      destination: { lat: destination.lat, lng: destination.lng }
    });
    if (route) setRouteInfo(route);
    setTripActive(true);
    setTripBusy(false);
  };

  const stopTrip = () => {
    if (mapFullscreenMode === "native") {
      void exitBrowserFullscreen();
    }
    setMapFullscreenMode("off");
    setTripActive(false);
    setRouteInfo(null);
    setRouteError("");
    setSlowWarning("");
    setLastNotifiedCount(null);
    setLastAlert(null);
    slowStartRef.current = 0;
    hasFitRouteRef.current = false;
  };

  const recenterMap = () => {
    const map = mapRef.current;
    const lat = myLocation?.lat;
    const lng = myLocation?.lng;
    if (!map || lat == null || lng == null) return;
    const nextZoom = Math.max(map.getZoom() || DEFAULT_MAP_ZOOM, DEFAULT_MAP_ZOOM);
    map.setView([lat, lng], nextZoom, { animate: true });
  };

  const fitRouteOnMap = () => {
    const map = mapRef.current;
    const line = routeLineRef.current;
    if (!map || !line) return;
    try {
      map.fitBounds(line.getBounds(), { padding: [24, 24] });
      hasFitRouteRef.current = true;
    } catch {
      // ignore
    }
  };

  const toggleMapFullscreen = async () => {
    const wrap = mapWrapRef.current;
    if (!wrap) return;

    if (mapFullscreenMode === "native") {
      const didExit = await exitBrowserFullscreen();
      if (!didExit) setMapFullscreenMode("off");
      return;
    }

    if (mapFullscreenMode === "fallback") {
      setMapFullscreenMode("off");
      return;
    }

    const didEnterNative = await requestBrowserFullscreen(wrap);
    if (didEnterNative) {
      setMapFullscreenMode("native");
    } else {
      setMapFullscreenMode("fallback");
    }
  };

  const sendAlert = async ({ reason }) => {
    if (alertBusy) return;
    if (!problemSpot && !myLocation) return;
    const now = Date.now();
    if (now - lastAlertAtRef.current < ALERT_COOLDOWN_MS && reason !== "MANUAL") {
      return;
    }

    const lat = problemSpot?.lat ?? myLocation?.lat;
    const lng = problemSpot?.lng ?? myLocation?.lng;
    if (lat == null || lng == null) return;

    setAlertBusy(true);
    setNotice("");
    try {
      const res = await api.post(
        "/api/ambulance/alert",
        {
          latitude: lat,
          longitude: lng,
          radiusMeters: DEFAULT_RADIUS_METERS,
          destinationLabel: destinationLabel.trim(),
          destinationLat: destinationLatLng?.lat ?? null,
          destinationLng: destinationLatLng?.lng ?? null,
          reason
        },
        { timeout: 15000 }
      );
      const data = res?.data || {};
      lastAlertAtRef.current = now;
      setLastAlert({ at: now, reason, lat, lng });
      setLastNotifiedCount(Number(data?.notified ?? 0));
      setNotice("Give-way alert sent.");
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) setNotice("Please login again.");
      else setNotice("Unable to send alert right now.");
    } finally {
      setAlertBusy(false);
    }
  };

  useEffect(() => {
    if (!tripActive) return undefined;
    const speedKmh = myLocation?.speedKmh;
    if (!Number.isFinite(speedKmh)) {
      setSlowWarning("");
      slowStartRef.current = 0;
      return undefined;
    }

    if (speedKmh <= SLOW_SPEED_KMH) {
      const startedAt = slowStartRef.current || Date.now();
      slowStartRef.current = startedAt;
      const elapsed = Date.now() - startedAt;
      if (elapsed >= SLOW_TRIGGER_MS) {
        setSlowWarning("Possible traffic jam / red-signal stop detected ahead. Sending give-way alerts within 500m.");
        void sendAlert({ reason: "SLOWDOWN" });
      } else {
        setSlowWarning(`Slow movement detected… (${Math.round(elapsed / 1000)}s)`);
      }
      return undefined;
    }

    setSlowWarning("");
    slowStartRef.current = 0;
    return undefined;
  }, [tripActive, myLocation, problemSpot]);

  if (loading) {
    return (
      <section className="ambulance-page">
        <div className="ambulance-card">
          <h1>Ambulance Navigation</h1>
          <p className="ambulance-muted">Loading…</p>
        </div>
      </section>
    );
  }

  const requestStatus = String(latestRequest?.status || "").toUpperCase();
  const isPending = requestStatus === "PENDING";
  const isRejected = requestStatus === "REJECTED";

  return (
    <section className="ambulance-page">
      <div className="ambulance-card">
        <header className="ambulance-head">
          <div>
            <h1>Ambulance Navigation</h1>
            <p className="ambulance-muted">
              Emergency route + give-way alerts. Alerts reach only users who enabled <strong>Traffic Alerts</strong>.
            </p>
          </div>
          <button type="button" className="ambulance-back" onClick={() => navigate(-1)}>
            Back
          </button>
        </header>

        {notice && <div className="ambulance-notice">{notice}</div>}

        {!approved ? (
          <div className="ambulance-grid">
            <div className="ambulance-panel">
              <h2>Driver approval</h2>
              <p className="ambulance-muted">
                This page is available only for admin-approved ambulance drivers.
              </p>

              {latestRequest && (
                <div className={`ambulance-request-state ${isPending ? "pending" : isRejected ? "rejected" : ""}`}>
                  <div>
                    <strong>Status:</strong> {requestStatus || "PENDING"}
                  </div>
                  {isRejected && latestRequest?.rejectReason && (
                    <div className="ambulance-request-reason">{String(latestRequest.rejectReason)}</div>
                  )}
                </div>
              )}

              {isPending ? (
                <p className="ambulance-muted">Request is pending. Please wait for admin approval.</p>
              ) : (
                <>
                  <div className="ambulance-form">
                    <label>
                      Driver name
                      <input
                        value={requestForm.driverName}
                        onChange={(e) => setRequestForm((p) => ({ ...p, driverName: e.target.value }))}
                        placeholder="Your name"
                      />
                    </label>
                    <label>
                      Phone
                      <input
                        value={requestForm.phone}
                        onChange={(e) => setRequestForm((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="Phone number"
                      />
                    </label>
                    <label>
                      Ambulance / Vehicle number
                      <input
                        value={requestForm.vehicleNumber}
                        onChange={(e) => setRequestForm((p) => ({ ...p, vehicleNumber: e.target.value }))}
                        placeholder="TN 01 AB 1234"
                      />
                    </label>
                    <label>
                      Service / Hospital
                      <input
                        value={requestForm.serviceName}
                        onChange={(e) => setRequestForm((p) => ({ ...p, serviceName: e.target.value }))}
                        placeholder="Service name"
                      />
                    </label>
                    <label>
                      Note (optional)
                      <textarea
                        value={requestForm.note}
                        onChange={(e) => setRequestForm((p) => ({ ...p, note: e.target.value }))}
                        placeholder="Any additional details for admin"
                        rows={4}
                      />
                    </label>
                    <button
                      type="button"
                      className="ambulance-primary"
                      onClick={requestApproval}
                      disabled={requestBusy}
                    >
                      {requestBusy ? "Submitting…" : "Request Approval"}
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="ambulance-panel">
              <h2>How it works (Phase 1)</h2>
              <ul className="ambulance-list">
                <li>Shows the route to the hospital.</li>
                <li>Detects slow movement and warns about possible jams / red-signal stops.</li>
                <li>Sends give-way popup alerts to nearby users (only if they enabled Traffic Alerts).</li>
                <li>Notifies admin dashboard when a trip starts or a traffic alert is sent.</li>
              </ul>
              <p className="ambulance-muted">
                Note: real traffic-signal control requires government/IoT integration (Phase 2).
              </p>
            </div>
          </div>
        ) : (
          <div className="ambulance-grid ambulance-grid-map">
            <div className="ambulance-panel ambulance-controls-panel">
              <h2>Trip setup</h2>
              <div className="ambulance-form">
                <label>
                  Hospital name (optional)
                  <input
                    value={destinationLabel}
                    onChange={(e) => setDestinationLabel(e.target.value)}
                    placeholder="Eg: City Hospital"
                  />
                </label>
                <label>
                  Hospital location
                  <input
                    value={destinationInput}
                    onChange={(e) => setDestinationInput(e.target.value)}
                    placeholder="Paste Google Maps link or 'lat,lng'"
                  />
                  <span className="ambulance-hint">
                    Tip: paste a Google Maps share link (we auto-detect coordinates).
                  </span>
                </label>

                <div className="ambulance-coords">
                  <div>
                    <span className="ambulance-muted">Detected:</span>{" "}
                    {destinationLatLng ? (
                      <strong>
                        {destinationLatLng.lat.toFixed(6)}, {destinationLatLng.lng.toFixed(6)}
                      </strong>
                    ) : (
                      <span className="ambulance-muted">No coordinates yet</span>
                    )}
                  </div>
                  <div className="ambulance-coords-actions">
                    {destinationMapsUrl && (
                      <a className="ambulance-link" href={destinationMapsUrl} target="_blank" rel="noreferrer">
                        Open in Google Maps
                      </a>
                    )}
                    {!destinationLatLng && isGoogleMapsLink(destinationInput) && (
                      <button
                        type="button"
                        className="ambulance-link-button"
                        onClick={resolveDestination}
                        disabled={resolveBusy}
                      >
                        {resolveBusy ? "Detecting..." : "Detect coordinates"}
                      </button>
                    )}
                  </div>
                </div>

                <div className="ambulance-actions">
                  {!tripActive ? (
                    <button
                      type="button"
                      className="ambulance-primary"
                      onClick={startTrip}
                      disabled={tripBusy}
                    >
                      {tripBusy ? "Starting…" : "Start Trip"}
                    </button>
                  ) : (
                    <button type="button" className="ambulance-danger" onClick={stopTrip}>
                      Stop Trip
                    </button>
                  )}

                  <button
                    type="button"
                    className="ambulance-ghost"
                    onClick={() => sendAlert({ reason: "MANUAL" })}
                    disabled={!tripActive || alertBusy}
                  >
                    {alertBusy ? "Sending…" : "Send Give-Way Alert Now"}
                  </button>
                </div>

                {tripActive && (
                  <div className="ambulance-stats">
                    <div>
                      <span className="ambulance-muted">Speed:</span>{" "}
                      <strong>
                        {Number.isFinite(myLocation?.speedKmh) ? `${Math.round(myLocation.speedKmh)} km/h` : "--"}
                      </strong>
                    </div>
                    <div>
                      <span className="ambulance-muted">Problem spot:</span>{" "}
                      {problemSpot ? (
                        <a className="ambulance-link" href={problemSpotUrl} target="_blank" rel="noreferrer">
                          {formatMeters(ROUTE_AHEAD_METERS)} ahead
                        </a>
                      ) : (
                        <span className="ambulance-muted">--</span>
                      )}
                    </div>
                    <div>
                      <span className="ambulance-muted">Last notified:</span>{" "}
                      <strong>
                        {lastNotifiedCount == null ? "--" : `${lastNotifiedCount} users`}
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="ambulance-panel ambulance-map-panel">
              <h2>Navigation map</h2>
              <div
                ref={mapWrapRef}
                className={`ambulance-map-wrap${mapFullscreen ? " ambulance-map-wrap-fullscreen" : ""}`}
              >
                <div ref={mapElRef} className="ambulance-map" />

                <div className="ambulance-map-bottom">
                  <div className="ambulance-chipbar">
                    <div className="ambulance-chipitem">
                      <div className="ambulance-chip-label">Speed</div>
                      <div className="ambulance-chip-value">
                        {Number.isFinite(myLocation?.speedKmh) ? `${Math.round(myLocation.speedKmh)} km/h` : "--"}
                      </div>
                    </div>
                    <span className="ambulance-chipbar-divider" aria-hidden="true" />
                    <div className="ambulance-chipitem">
                      <div className="ambulance-chip-label">ETA</div>
                      <div className="ambulance-chip-value">{routeInfo ? formatDuration(routeInfo.duration) : "--"}</div>
                    </div>
                    <span className="ambulance-chipbar-divider" aria-hidden="true" />
                    <div className="ambulance-chipitem">
                      <div className="ambulance-chip-label">Problem</div>
                      {problemSpot ? (
                        <a
                          className="ambulance-chip-value ambulance-chip-link"
                          href={problemSpotUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {formatMeters(ROUTE_AHEAD_METERS)} ahead
                        </a>
                      ) : (
                        <div className="ambulance-chip-value">--</div>
                      )}
                    </div>
                  </div>

                  <div className="ambulance-map-foot">
                    <div className="ambulance-map-tools">
                      {!tripActive ? (
                        <button
                          type="button"
                          className="ambulance-map-pill ambulance-map-pill-primary"
                          onClick={startTrip}
                          disabled={tripBusy || resolveBusy}
                          aria-label="Start trip"
                          title="Start trip"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M9 7l10 5-10 5V7z" fill="currentColor" />
                          </svg>
                          <span>{tripBusy ? "Starting…" : "Start"}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ambulance-map-pill ambulance-map-pill-danger"
                          onClick={stopTrip}
                          aria-label="Stop trip"
                          title="Stop trip"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M8 8h8v8H8V8z" fill="currentColor" />
                          </svg>
                          <span>Stop</span>
                        </button>
                      )}

                      <button
                        type="button"
                        className="ambulance-map-pill ambulance-map-pill-warn"
                        onClick={() => sendAlert({ reason: "MANUAL" })}
                        disabled={!tripActive || alertBusy}
                        aria-label="Send give-way alert"
                        title="Send give-way alert"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M12 3a7 7 0 0 0-7 7v5l-1.6 2.4A1 1 0 0 0 4.2 19h15.6a1 1 0 0 0 .8-1.6L19 15v-5a7 7 0 0 0-7-7zm0 18a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 21z"
                            fill="currentColor"
                          />
                        </svg>
                        <span>{alertBusy ? "Sending…" : "Give-Way"}</span>
                      </button>

                      <span className="ambulance-map-divider" aria-hidden="true" />

                      <button
                        type="button"
                        className={`ambulance-map-pill ambulance-map-pill-icon${followMode ? " is-active" : ""}`}
                        onClick={() => setFollowMode((v) => !v)}
                        disabled={!myLocation?.lat || !myLocation?.lng}
                        aria-pressed={followMode}
                        aria-label={`Follow mode: ${followMode ? "on" : "off"}`}
                        title={`Follow mode: ${followMode ? "ON" : "OFF"}`}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M12 2L4 21l8-4 8 4-8-19z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span>Follow</span>
                      </button>

                      <button
                        type="button"
                        className="ambulance-map-pill ambulance-map-pill-icon"
                        onClick={recenterMap}
                        disabled={!myLocation?.lat || !myLocation?.lng}
                        aria-label="Recenter map"
                        title="Recenter map"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          />
                          <path
                            d="M12 2v3M12 19v3M2 12h3M19 12h3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </svg>
                        <span>Recenter</span>
                      </button>

                      <button
                        type="button"
                        className="ambulance-map-pill ambulance-map-pill-icon"
                        onClick={fitRouteOnMap}
                        disabled={!routeInfo}
                        aria-label="Fit route"
                        title="Fit route"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <circle cx="6.5" cy="17.5" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                          <circle cx="17.5" cy="6.5" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                          <path
                            d="M8.2 15.8l7.6-7.6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </svg>
                        <span>Fit</span>
                      </button>

                      {tripActive && (
                        <button
                          type="button"
                          className={`ambulance-map-pill ambulance-map-pill-icon${mapFullscreen ? " is-active" : ""}`}
                          onClick={() => {
                            void toggleMapFullscreen();
                          }}
                          aria-label={mapFullscreen ? "Exit full screen map" : "Open full screen map"}
                          title={mapFullscreen ? "Exit full screen" : "Full screen"}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            {mapFullscreen ? (
                              <path
                                d="M10 6H6v4M14 6h4v4M10 18H6v-4M14 18h4v-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            ) : (
                              <path
                                d="M9 4H4v5M15 4h5v5M9 20H4v-5M20 15v5h-5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            )}
                          </svg>
                          <span>{mapFullscreen ? "Exit" : "Fullscreen"}</span>
                        </button>
                      )}
                    </div>
                    <span className="ambulance-map-foot-text">
                      Alerts: {lastNotifiedCount == null ? "--" : `${lastNotifiedCount} users`} • Radius: {DEFAULT_RADIUS_METERS}m
                    </span>
                  </div>
                </div>

                {(!myLocation?.lat || !myLocation?.lng) && (
                  <div className="ambulance-map-banner">Turn on location to see your live position.</div>
                )}
              </div>
              {slowWarning && <div className="ambulance-warning">{slowWarning}</div>}
              {routeError && <div className="ambulance-error">{routeError}</div>}
              {!tripActive && <p className="ambulance-muted">Start a trip to calculate the route.</p>}
              {tripActive && routeLoading && <p className="ambulance-muted">Loading route…</p>}
              {tripActive && routeInfo && (
                <>
                  <div className="ambulance-route-summary">
                    <div>
                      <span className="ambulance-muted">Distance</span>
                      <strong>{formatMeters(routeInfo.distance)}</strong>
                    </div>
                    <div>
                      <span className="ambulance-muted">ETA</span>
                      <strong>{formatDuration(routeInfo.duration)}</strong>
                    </div>
                    <div>
                      <span className="ambulance-muted">Alerts radius</span>
                      <strong>{DEFAULT_RADIUS_METERS}m</strong>
                    </div>
                  </div>

                  <div className="ambulance-steps">
                    {routeInfo.steps.slice(0, 18).map((step, idx) => (
                      <div key={`${idx}-${step?.distance}`} className="ambulance-step">
                        <div className="ambulance-step-title">{normalizeStepLabel(step)}</div>
                        <div className="ambulance-step-meta">
                          {formatMeters(step?.distance)} • {formatDuration(step?.duration)}
                        </div>
                      </div>
                    ))}
                    {routeInfo.steps.length > 18 && (
                      <div className="ambulance-muted">+ {routeInfo.steps.length - 18} more steps…</div>
                    )}
                  </div>

                  {lastAlert && (
                    <div className="ambulance-last-alert">
                      <div>
                        <span className="ambulance-muted">Last alert:</span>{" "}
                        <strong>{String(lastAlert.reason)}</strong>
                      </div>
                      <a
                        className="ambulance-link"
                        href={buildSpotMapsUrl({ lat: lastAlert.lat, lng: lastAlert.lng })}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View spot
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
