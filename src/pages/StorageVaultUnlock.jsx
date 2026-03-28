import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  clearVaultLock,
  clearVaultUnlocked,
  isVaultSupported,
  isVaultUnlocked,
  readVaultLock,
  saveVaultLock,
  setVaultUnlocked
} from "../services/vaultStorage";
import { VAULT_GALLERY, VAULT_GALLERY_TOTAL } from "../data/vaultGallery";
import "./StorageVault.css";

const LOCK_PICK_COUNT = 5;

const sanitizeSelection = (ids) =>
  (Array.isArray(ids) ? ids : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean);

const isSameSelection = (left, right) => {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
};

const VAULT_IMAGE_MAP = VAULT_GALLERY.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

export default function StorageVaultUnlock() {
  const navigate = useNavigate();
  const [lock, setLock] = useState(() => readVaultLock());
  const [unlocked, setUnlocked] = useState(() => (lock ? isVaultUnlocked(lock) : false));
  const [lockBusy, setLockBusy] = useState(false);
  const [lockError, setLockError] = useState("");
  const [selectedImageIds, setSelectedImageIds] = useState([]);
  const [setupStage, setSetupStage] = useState("pick");
  const [primaryImageIds, setPrimaryImageIds] = useState([]);
  const [unsupported, setUnsupported] = useState(false);

  const isSetupMode = !lock;
  const isUnlockMode = Boolean(lock && !unlocked);
  const isConfirmStage = isSetupMode && setupStage === "confirm";

  useEffect(() => {
    if (!isVaultSupported()) {
      setUnsupported(true);
      return;
    }
    setUnsupported(false);
  }, []);

  useEffect(() => {
    clearVaultUnlocked();
    setUnlocked(false);
  }, []);

  useEffect(() => {
    if (lock) {
      setUnlocked(isVaultUnlocked(lock));
    } else {
      setUnlocked(false);
    }
  }, [lock]);

  useEffect(() => {
    setLockError("");
    setSelectedImageIds([]);
    setPrimaryImageIds([]);
    setSetupStage("pick");
  }, [lock, unlocked]);

  useEffect(() => {
    if (!isUnlockMode || !lock) return;
    if (selectedImageIds.length !== LOCK_PICK_COUNT) return;
    handleUnlock();
  }, [isUnlockMode, lock, selectedImageIds]);

  const resetSetup = () => {
    setLockError("");
    setSelectedImageIds([]);
    setPrimaryImageIds([]);
    setSetupStage("pick");
  };

  const handleSelectImage = (id) => {
    setLockError("");
    setSelectedImageIds((prev) => {
      if (prev.length >= LOCK_PICK_COUNT) {
        setLockError(`You can only pick ${LOCK_PICK_COUNT} pictures.`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleRemoveSelected = (index) => {
    setLockError("");
    setSelectedImageIds((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleCreateLock = () => {
    if (lockBusy) return;
    const normalized = sanitizeSelection(selectedImageIds);
    if (normalized.length !== LOCK_PICK_COUNT) {
      setLockError(`Pick exactly ${LOCK_PICK_COUNT} pictures.`);
      return;
    }
    if (!isConfirmStage) {
      setPrimaryImageIds(normalized);
      setSelectedImageIds([]);
      setSetupStage("confirm");
      setLockError("");
      return;
    }
    if (!isSameSelection(normalized, sanitizeSelection(primaryImageIds))) {
      setLockError("Pictures do not match. Please start over.");
      setSetupStage("pick");
      setPrimaryImageIds([]);
      setSelectedImageIds([]);
      return;
    }
    setLockBusy(true);
    setLockError("");
    try {
      const nextLock = {
        imageIds: normalized,
        createdAt: Date.now()
      };
      saveVaultLock(nextLock);
      setVaultUnlocked(nextLock);
      setLock(nextLock);
      setUnlocked(true);
      navigate("/storage", { replace: true });
    } catch (err) {
      setLockError(err?.message || "Unable to create vault lock.");
    } finally {
      setLockBusy(false);
    }
  };

  const handleUnlock = () => {
    if (lockBusy || !lock) return;
    const normalized = sanitizeSelection(selectedImageIds);
    if (normalized.length !== LOCK_PICK_COUNT) {
      setLockError(`Select ${LOCK_PICK_COUNT} pictures to unlock.`);
      return;
    }
    if (!isSameSelection(normalized, sanitizeSelection(lock.imageIds))) {
      setLockError("Selected pictures do not match.");
      return;
    }
    setLockBusy(true);
    setLockError("");
    try {
      setVaultUnlocked(lock);
      setUnlocked(true);
      navigate("/storage", { replace: true });
    } catch (err) {
      setLockError(err?.message || "Unable to unlock vault.");
    } finally {
      setLockBusy(false);
    }
  };

  const handleResetLock = () => {
    const ok = window.confirm(
      `Reset vault lock? Your stored files stay, but you must choose ${LOCK_PICK_COUNT} new pictures.`
    );
    if (!ok) return;
    clearVaultUnlocked();
    clearVaultLock();
    setLock(null);
    setUnlocked(false);
  };

  const selectionCount = `${selectedImageIds.length}/${LOCK_PICK_COUNT}`;
  const selectionHint = isSetupMode
    ? (isConfirmStage
      ? `Confirm the same ${LOCK_PICK_COUNT} pictures in the same order (${selectionCount}). Tap a slot to remove.`
      : `Pick ${LOCK_PICK_COUNT} pictures in order (${selectionCount}). You can repeat a picture. Tap a slot to remove.`)
    : `Select your ${LOCK_PICK_COUNT} pictures in the same order (${selectionCount}). Tap a slot to remove.`;

  const selectedCounts = selectedImageIds.reduce((acc, id) => {
    acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {});

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
              Unlock your private storage to continue.
            </p>
          </div>
          <div className="storage-top-actions">
            {lock && (
              <button type="button" className="storage-top-btn secondary" onClick={handleResetLock}>
                Reset Lock
              </button>
            )}
          </div>
        </header>

        <section className="vault-lock">
          <div className="vault-lock-header">
            <h3>
              {isSetupMode
                ? (isConfirmStage ? "Confirm Vault Pictures" : "Create Vault Lock")
                : "Unlock Vault"}
            </h3>
            <p>
              {isSetupMode
                ? `Choose ${LOCK_PICK_COUNT} secret pictures from ${VAULT_GALLERY_TOTAL} picks (repeats allowed). You will confirm the same ${LOCK_PICK_COUNT} pictures in the same order to set the lock.`
                : `Select your ${LOCK_PICK_COUNT} secret pictures in the same order to open the vault.`}
            </p>
          </div>

          <p className="vault-empty">{selectionHint}</p>

          <div className="vault-selected">
            {Array.from({ length: LOCK_PICK_COUNT }).map((_, index) => {
              const id = selectedImageIds[index];
              const item = id ? VAULT_IMAGE_MAP[id] : null;
              return (
                <button
                  key={`selected-${index}`}
                  type="button"
                  className={`vault-selected-slot ${item ? "has" : ""}`}
                  onClick={() => item && handleRemoveSelected(index)}
                  title={item ? "Remove selection" : `Slot ${index + 1}`}
                  aria-label={item ? `Remove selection ${index + 1}` : `Slot ${index + 1}`}
                >
                  {item ? (
                    <>
                      <img src={item.src} alt={item.label} loading="lazy" />
                      <span className="vault-selected-index">{index + 1}</span>
                    </>
                  ) : (
                    <span className="vault-selected-placeholder">{index + 1}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="vault-gallery">
            {VAULT_GALLERY.map((item) => {
              const count = selectedCounts[item.id] || 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`vault-card ${count > 0 ? "is-selected" : ""}`}
                  onClick={() => handleSelectImage(item.id)}
                  aria-pressed={count > 0}
                  title={item.label}
                >
                  {count > 0 && <span className="vault-card-count">{count}</span>}
                  <img src={item.src} alt={item.label} loading="lazy" />
                  <span className="vault-card-label">{item.label}</span>
                </button>
              );
            })}
          </div>

          {lockError && <p className="vault-error">{lockError}</p>}
          {unsupported && (
            <p className="vault-error">Storage is not supported in this browser.</p>
          )}

          <div className="vault-actions">
            {isSetupMode ? (
              <button type="button" onClick={handleCreateLock} disabled={lockBusy || unsupported}>
                {lockBusy ? "Creating..." : (isConfirmStage ? "Create Vault Lock" : "Next: Confirm Pictures")}
              </button>
            ) : (
              <button type="button" onClick={handleUnlock} disabled={lockBusy || unsupported}>
                {lockBusy ? "Unlocking..." : "Unlock Vault"}
              </button>
            )}
            {isSetupMode && isConfirmStage && (
              <button type="button" className="secondary" onClick={resetSetup} disabled={lockBusy}>
                Start over
              </button>
            )}
            {isUnlockMode && (
              <button type="button" className="secondary" onClick={handleResetLock} disabled={lockBusy}>
                Reset lock
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
