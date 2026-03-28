import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  addVaultFiles,
  clearVault,
  clearVaultLock,
  clearVaultUnlocked,
  getVaultItems,
  isVaultUnlocked,
  isVaultSupported,
  readVaultLock,
  removeVaultItem
} from "../services/vaultStorage";
import "./StorageVault.css";

const formatBytes = (value) => {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const scaled = size / Math.pow(1024, idx);
  return `${scaled.toFixed(scaled >= 100 || idx === 0 ? 0 : 1)} ${units[idx]}`;
};

const inferKind = (item) => {
  const type = String(item?.type || "").toLowerCase();
  const name = String(item?.name || "").toLowerCase();
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp|tiff?)$/.test(name)) return "image";
  if (type.startsWith("video/") || /\.(mp4|mov|webm|mkv|m4v|avi|mpg|mpeg|3gp|ogv)$/.test(name)) return "video";
  if (type.startsWith("audio/") || /\.(mp3|wav|aac|flac|m4a|ogg|opus)$/.test(name)) return "audio";
  return "file";
};

const formatDate = (value) => {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
};

const FREE_CLOUD_GB = 2;
const PRICE_PER_GB = 10;
const CURRENCY_LABEL = "INR";
const BANK_DETAILS = [
  { label: "Account Name", value: "Your Name" },
  { label: "Account Number", value: "000000000000" },
  { label: "Bank Name", value: "Your Bank" },
  { label: "IFSC", value: "BANK0000000" },
  { label: "UPI ID", value: "yourname@upi" }
];

export default function StorageVault() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unsupported, setUnsupported] = useState(false);
  const [urlMap, setUrlMap] = useState({});
  const [lock, setLock] = useState(() => readVaultLock());
  const [unlocked, setUnlocked] = useState(() => (lock ? isVaultUnlocked(lock) : false));
  const [storagePlan, setStoragePlan] = useState("local");
  const [extraGb, setExtraGb] = useState(0);
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");

  const isVaultOpen = Boolean(lock && unlocked);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await getVaultItems();
      setItems(list);
    } catch (err) {
      setError(err?.message || "Failed to load stored files.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isVaultSupported()) {
      setUnsupported(true);
      setLoading(false);
      return;
    }
    setUnsupported(false);
  }, []);

  useEffect(() => {
    if (unsupported || !isVaultOpen) return;
    loadItems();
  }, [unsupported, isVaultOpen, loadItems]);

  useEffect(() => {
    if (lock) {
      setUnlocked(isVaultUnlocked(lock));
    } else {
      setUnlocked(false);
    }
  }, [lock]);

  useEffect(() => {
    const next = {};
    items.forEach((item) => {
      if (item?.blob instanceof Blob) {
        next[item.id] = URL.createObjectURL(item.blob);
      }
    });
    setUrlMap(next);
    return () => {
      Object.values(next).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore revoke errors
        }
      });
    };
  }, [items]);

  const handlePick = () => {
    if (inputRef.current) {
      inputRef.current.multiple = true;
      inputRef.current.click();
    }
  };

  const handleFiles = async (event) => {
    const list = Array.from(event.target.files || []);
    if (!list.length) return;
    setBusy(true);
    setError("");
    try {
      await addVaultFiles(list);
      await loadItems();
    } catch (err) {
      setError(err?.message || "Upload failed.");
    } finally {
      setBusy(false);
      if (event.target) event.target.value = "";
    }
  };

  const handleRemove = async (id) => {
    setBusy(true);
    setError("");
    try {
      await removeVaultItem(id);
      await loadItems();
    } catch (err) {
      setError(err?.message || "Failed to remove item.");
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (!items.length) return;
    setBusy(true);
    setError("");
    try {
      await clearVault();
      await loadItems();
    } catch (err) {
      setError(err?.message || "Failed to clear storage.");
    } finally {
      setBusy(false);
    }
  };

  const handleLockNow = () => {
    clearVaultUnlocked();
    setUnlocked(false);
    setItems([]);
    setUrlMap({});
    setLoading(false);
    navigate("/storage/unlock", { replace: true });
  };

  const handleResetLock = () => {
    const ok = window.confirm("Reset vault lock? Your stored files stay, but you must choose new pictures.");
    if (!ok) return;
    clearVaultUnlocked();
    clearVaultLock();
    setLock(null);
    setUnlocked(false);
    navigate("/storage/unlock", { replace: true });
  };

  const normalizedExtraGb = Math.max(0, Math.floor(Number(extraGb || 0)));
  const totalCost = normalizedExtraGb * PRICE_PER_GB;

  const handleExtraGbChange = (event) => {
    const value = Number(event.target.value || 0);
    if (!Number.isFinite(value)) {
      setExtraGb(0);
      setPaymentStatus("");
      return;
    }
    setExtraGb(Math.max(0, Math.floor(value)));
    setPaymentStatus("");
  };

  const handleSubmitPayment = () => {
    if (!normalizedExtraGb || !paymentRef.trim()) {
      setPaymentStatus("Add the extra GB and payment reference to continue.");
      return;
    }
    setPaymentStatus("Payment submitted. We will verify and activate extra storage soon.");
  };

  if (!lock || !unlocked) {
    return <Navigate to="/storage/unlock" replace />;
  }

  return (
    <div className="storage-page">
      <div className="storage-shell">
        <header className="storage-top">
          <button type="button" className="storage-back" onClick={() => navigate(-1)}>
            {"<"}
          </button>
          <div className="storage-top-copy">
            <h1>Storage Vault</h1>
            <p className="storage-subtitle">
              Store private files on this device. Images, videos, docs, and more.
            </p>
          </div>
          <div className="storage-top-actions">
            {isVaultOpen && (
              <button type="button" className="storage-top-btn" onClick={handleLockNow}>
                Lock
              </button>
            )}
            {lock && (
              <button type="button" className="storage-top-btn secondary" onClick={handleResetLock}>
                Reset Lock
              </button>
            )}
          </div>
        </header>

        <section className="storage-plans">
          <div className="storage-plan-header">
            <h2>Storage Options</h2>
            <p>Choose where your files live. Local files stay only on this device.</p>
          </div>
          <div className="storage-plan-grid">
            <article className={`storage-plan-card ${storagePlan === "local" ? "active" : ""}`}>
              <div className="storage-plan-title">
                <h3>Local Device</h3>
                <span className="storage-plan-badge">Free</span>
              </div>
              <p className="storage-plan-copy">
                Store files only on this device using the vault lock. Works offline and stays private.
              </p>
              <p className="storage-plan-detail">Best for personal storage on one device.</p>
              <button
                type="button"
                className="storage-plan-btn"
                onClick={() => setStoragePlan("local")}
              >
                {storagePlan === "local" ? "Selected" : "Use Local Storage"}
              </button>
            </article>

            <article className={`storage-plan-card ${storagePlan === "cloud" ? "active" : ""}`}>
              <div className="storage-plan-title">
                <h3>Cloud Storage</h3>
                <span className="storage-plan-badge">{FREE_CLOUD_GB} GB Free</span>
              </div>
              <p className="storage-plan-copy">
                Get {FREE_CLOUD_GB} GB free. Pay only for extra storage beyond the free limit.
              </p>
              <p className="storage-plan-detail">
                Extra storage is activated after payment verification.
              </p>
              <button
                type="button"
                className="storage-plan-btn"
                onClick={() => setStoragePlan("cloud")}
              >
                {storagePlan === "cloud" ? "Selected" : "Enable Cloud Storage"}
              </button>
            </article>
          </div>
        </section>

        {storagePlan === "cloud" && (
          <section className="storage-billing">
            <div className="storage-billing-header">
              <h3>Cloud Storage Billing</h3>
              <p>First {FREE_CLOUD_GB} GB is free. Choose extra GB and pay to extend.</p>
            </div>
            <div className="storage-billing-grid">
              <div className="storage-billing-card">
                <h4>Calculate Extra Storage</h4>
                <label className="storage-billing-label" htmlFor="extra-gb-input">
                  Extra GB needed
                </label>
                <input
                  id="extra-gb-input"
                  className="storage-billing-input"
                  type="number"
                  min="0"
                  step="1"
                  value={extraGb}
                  onChange={handleExtraGbChange}
                />
                <div className="storage-billing-row">
                  <span>Extra storage</span>
                  <strong>{normalizedExtraGb} GB</strong>
                </div>
                <div className="storage-billing-row">
                  <span>Rate</span>
                  <strong>
                    {CURRENCY_LABEL} {PRICE_PER_GB} per GB
                  </strong>
                </div>
                <div className="storage-billing-row total">
                  <span>Total</span>
                  <strong>
                    {CURRENCY_LABEL} {totalCost}
                  </strong>
                </div>
                <p className="storage-billing-note">
                  Pay only for extra storage beyond the free {FREE_CLOUD_GB} GB.
                </p>
              </div>

              <div className="storage-billing-card">
                <h4>Bank Transfer Details</h4>
                <div className="storage-bank-list">
                  {BANK_DETAILS.map((detail) => (
                    <div className="storage-bank-item" key={detail.label}>
                      <span>{detail.label}</span>
                      <strong>{detail.value}</strong>
                    </div>
                  ))}
                </div>
                <p className="storage-billing-note">
                  Use the details above to pay for extra storage.
                </p>
              </div>

              <div className="storage-billing-card">
                <h4>Confirm Payment</h4>
                <label className="storage-billing-label" htmlFor="payment-ref-input">
                  Payment reference / UTR
                </label>
                <input
                  id="payment-ref-input"
                  className="storage-billing-input"
                  type="text"
                  value={paymentRef}
                  onChange={(event) => {
                    setPaymentRef(event.target.value);
                    setPaymentStatus("");
                  }}
                  placeholder="Enter your transfer reference"
                />
                <label className="storage-billing-label" htmlFor="payment-note-input">
                  Notes (optional)
                </label>
                <input
                  id="payment-note-input"
                  className="storage-billing-input"
                  type="text"
                  value={paymentNote}
                  onChange={(event) => {
                    setPaymentNote(event.target.value);
                    setPaymentStatus("");
                  }}
                  placeholder="Any note for verification"
                />
                <button type="button" className="storage-plan-btn" onClick={handleSubmitPayment}>
                  Submit Payment
                </button>
                {paymentStatus && <p className="storage-billing-status">{paymentStatus}</p>}
              </div>
            </div>
          </section>
        )}

        <section className="storage-uploader">
          <div className="storage-upload-row">
            <div>
              <h3>Upload files</h3>
              <p>Files are private and stay on this device unless you share them.</p>
            </div>
            <div className="storage-upload-actions">
              <button type="button" className="storage-upload-btn" onClick={handlePick} disabled={busy || unsupported}>
                {busy ? "Uploading..." : "Choose files"}
              </button>
              <button type="button" className="storage-clear-btn" onClick={handleClear} disabled={busy || !items.length}>
                Clear all
              </button>
            </div>
            <input ref={inputRef} type="file" multiple onChange={handleFiles} />
          </div>
          <p className="storage-tip">
            Tip: hold Ctrl/Shift (Cmd on Mac) to select multiple files in the picker.
          </p>
          {unsupported && (
            <p className="storage-error">Storage is not supported in this browser.</p>
          )}
          {!unsupported && (
            <p className="storage-meta">
              {items.length} item{items.length === 1 ? "" : "s"} stored
            </p>
          )}
          {error && <p className="storage-error">{error}</p>}
        </section>

        <section className="storage-grid">
          {loading && <p className="storage-empty">Loading stored files...</p>}
          {!loading && !items.length && (
            <p className="storage-empty">No files yet. Upload anything you want to keep private.</p>
          )}
          {!loading &&
            items.map((item) => {
              const kind = inferKind(item);
              const url = urlMap[item.id];
              return (
                <article className="storage-item" key={`vault-${item.id}`}>
                  <div className="storage-preview">
                    {kind === "image" && url && <img src={url} alt={item.name || "Stored file"} />}
                    {kind === "video" && url && (
                      <video src={url} preload="metadata" muted playsInline />
                    )}
                    {(kind === "audio" || kind === "file" || !url) && (
                      <span className="storage-file-icon">
                        {kind === "audio" ? "AUDIO" : "FILE"}
                      </span>
                    )}
                  </div>
                  <div className="storage-info">
                    <h4>{item.name || "Untitled"}</h4>
                    <p>
                      {formatBytes(item.size)} - {item.type || "Unknown"} - {formatDate(item.addedAt)}
                    </p>
                  </div>
                  <div className="storage-actions">
                    {url && (
                      <a className="storage-action" href={url} download={item.name || "download"}>
                        Download
                      </a>
                    )}
                    <button
                      type="button"
                      className="storage-action secondary"
                      onClick={() => handleRemove(item.id)}
                      disabled={busy}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              );
            })}
        </section>
      </div>
    </div>
  );
}

