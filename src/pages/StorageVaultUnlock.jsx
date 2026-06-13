import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addVaultFiles,
  clearVaultLockSynced,
  clearVaultUnlocked,
  getVaultItems,
  isVaultSupported,
  isVaultUnlocked,
  readVaultLockSynced,
  removeVaultItem,
  saveVaultLockSynced,
  setVaultUnlocked
} from "../services/vaultStorage";
import "./StorageVault.css";

const LOCK_PICK_COUNT = 5;
const LOCK_BANK_MAX = 20;
const IMAGE_FILE_REGEX = /\.(png|jpe?g|gif|webp|bmp|svg|tiff?)$/i;
const LOCK_BANK_SOURCE = "vault-lock-bank";

const sanitizeSelection = (values) =>
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);

const isSameSelection = (left, right) => {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
};

const toHex = (buffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const buildFallbackSignature = (file, byteLength) => {
  const safeName = String(file?.name || "").trim().toLowerCase();
  const safeType = String(file?.type || "").trim().toLowerCase();
  const safeSize = Number(file?.size || byteLength || 0);
  const safeLastModified = Number(file?.lastModified || 0);
  return `meta:${safeName}|${safeType}|${safeSize}|${safeLastModified}`;
};

const isImageFile = (file) => {
  if (!(file instanceof File)) return false;
  const safeType = String(file.type || "").toLowerCase();
  const safeName = String(file.name || "").toLowerCase();
  return safeType.startsWith("image/") || IMAGE_FILE_REGEX.test(safeName);
};

const buildFileSignature = async (file) => {
  const buffer = await file.arrayBuffer();
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", buffer);
    return `sha256:${toHex(hashBuffer)}`;
  }
  return buildFallbackSignature(file, buffer.byteLength);
};

const createSelectionEntry = async (file, index) => {
  const signature = await buildFileSignature(file);
  return {
    id: `vault-lock-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
    file,
    signature,
    previewUrl: URL.createObjectURL(file),
    label: file.name || `Picture ${index + 1}`
  };
};

const revokeEntryPreview = (entry) => {
  if (!entry?.previewUrl) return;
  try {
    URL.revokeObjectURL(entry.previewUrl);
  } catch {
    // ignore revoke errors
  }
};

const revokeEntryList = (entries) => {
  (Array.isArray(entries) ? entries : []).forEach(revokeEntryPreview);
};

const normalizeLockBankItem = (item) => {
  if (!item || !(item.blob instanceof Blob)) return null;
  const signature = String(item?.meta?.signature || "").trim();
  if (!signature) return null;
  return {
    id: item.id,
    name: item.name || "Saved picture",
    type: item.type || item.blob.type || "image/*",
    blob: item.blob,
    signature,
    previewUrl: URL.createObjectURL(item.blob),
    addedAt: Number(item.addedAt || Date.now())
  };
};

export default function StorageVaultUnlock() {
  const navigate = useNavigate();
  const pickerInputRef = useRef(null);
  const bankInputRef = useRef(null);
  const selectedEntriesRef = useRef([]);
  const lockBankRef = useRef([]);
  const [lock, setLock] = useState(null);
  const [lockLoaded, setLockLoaded] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [lockError, setLockError] = useState("");
  const [lockNotice, setLockNotice] = useState("");
  const [selectedEntries, setSelectedEntries] = useState([]);
  const [lockBankItems, setLockBankItems] = useState([]);
  const [setupStage, setSetupStage] = useState("pick");
  const [primarySignatures, setPrimarySignatures] = useState([]);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [bankBusy, setBankBusy] = useState(false);
  const [saveLockPictures, setSaveLockPictures] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  const isSetupMode = !lock;
  const isUnlockMode = Boolean(lock && !unlocked);
  const isConfirmStage = isSetupMode && setupStage === "confirm";
  const legacyLock = Boolean(lock?.legacy);
  const selectedSignatures = useMemo(
    () => sanitizeSelection(selectedEntries.map((entry) => entry.signature)),
    [selectedEntries]
  );

  useEffect(() => {
    selectedEntriesRef.current = selectedEntries;
  }, [selectedEntries]);

  useEffect(() => {
    lockBankRef.current = lockBankItems;
  }, [lockBankItems]);

  useEffect(() => {
    return () => {
      revokeEntryList(selectedEntriesRef.current);
      revokeEntryList(lockBankRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isVaultSupported()) {
      setUnsupported(true);
      setLockLoaded(true);
      return;
    }
    setUnsupported(false);
    let cancelled = false;
    (async () => {
      try {
        const synced = await readVaultLockSynced();
        if (cancelled) return;
        setLock(synced);
        setUnlocked(synced ? isVaultUnlocked(synced) : false);
      } finally {
        if (!cancelled) setLockLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    clearVaultUnlocked();
    setUnlocked(false);
  }, []);

  const clearSelectedEntries = useCallback(() => {
    setSelectedEntries((prev) => {
      revokeEntryList(prev);
      return [];
    });
  }, []);

  const loadLockBankItems = useCallback(async () => {
    const all = await getVaultItems();
    const next = all
      .filter((item) => String(item?.source || "").trim() === LOCK_BANK_SOURCE)
      .map(normalizeLockBankItem)
      .filter(Boolean)
      .sort((a, b) => Number(b.addedAt || 0) - Number(a.addedAt || 0))
      .slice(0, LOCK_BANK_MAX);
    setLockBankItems((prev) => {
      revokeEntryList(prev);
      return next;
    });
    return next;
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
    setLockNotice("");
    clearSelectedEntries();
    setPrimarySignatures([]);
    setSaveLockPictures(false);
    setSetupStage("pick");
  }, [lock, unlocked, clearSelectedEntries]);

  useEffect(() => {
    if (unsupported) return;
    let cancelled = false;
    (async () => {
      try {
        const next = await loadLockBankItems();
        if (cancelled) revokeEntryList(next);
      } catch {
        if (!cancelled) {
          setLockError("Unable to load saved lock pictures.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [unsupported, loadLockBankItems]);

  const resetSetup = () => {
    setLockError("");
    setLockNotice("");
    clearSelectedEntries();
    setPrimarySignatures([]);
    setSetupStage("pick");
  };

  const openPicker = () => {
    if (pickerBusy || bankBusy || lockBusy || unsupported) return;
    if (pickerInputRef.current) {
      pickerInputRef.current.multiple = true;
      pickerInputRef.current.click();
    }
  };

  const openLockBankPicker = () => {
    if (pickerBusy || bankBusy || lockBusy || unsupported) return;
    if (lockBankItems.length >= LOCK_BANK_MAX) {
      setLockNotice(`You can save up to ${LOCK_BANK_MAX} pictures.`);
      return;
    }
    if (bankInputRef.current) {
      bankInputRef.current.multiple = true;
      bankInputRef.current.click();
    }
  };

  const appendSelectedEntries = useCallback((entries) => {
    if (!entries.length) return;
    setSelectedEntries((prev) => {
      const remaining = Math.max(0, LOCK_PICK_COUNT - prev.length);
      if (!remaining) {
        setLockError(`You can only pick ${LOCK_PICK_COUNT} pictures.`);
        revokeEntryList(entries);
        return prev;
      }
      const accepted = entries.slice(0, remaining);
      const overflow = entries.length - accepted.length;
      if (overflow > 0) {
        revokeEntryList(entries.slice(remaining));
        setLockNotice(`${overflow} extra image${overflow === 1 ? "" : "s"} ignored.`);
      }
      return [...prev, ...accepted];
    });
  }, []);

  const handleSelectFiles = async (event) => {
    const picked = Array.from(event.target.files || []);
    if (event.target) event.target.value = "";
    if (!picked.length) return;

    setLockError("");
    setLockNotice("");
    const validImages = picked.filter(isImageFile);
    const invalidCount = picked.length - validImages.length;
    if (!validImages.length) {
      setLockError("Please choose image files only.");
      return;
    }

    setPickerBusy(true);
    try {
      const built = await Promise.all(
        validImages.map((file, index) => createSelectionEntry(file, index))
      );
      appendSelectedEntries(built);

      const notices = [];
      if (invalidCount > 0) {
        notices.push(`${invalidCount} non-image file${invalidCount === 1 ? "" : "s"} ignored.`);
      }
      if (notices.length) {
        setLockNotice(notices.join(" "));
      }
    } catch (err) {
      setLockError(err?.message || "Unable to process selected pictures.");
    } finally {
      setPickerBusy(false);
    }
  };

  const handleSaveLockBankFiles = async (event) => {
    const picked = Array.from(event.target.files || []);
    if (event.target) event.target.value = "";
    if (!picked.length) return;

    setLockError("");
    setLockNotice("");
    const validImages = picked.filter(isImageFile);
    const invalidCount = picked.length - validImages.length;
    if (!validImages.length) {
      setLockError("Please choose image files only.");
      return;
    }

    const existingSigs = new Set(lockBankItems.map((item) => item.signature));
    const remaining = Math.max(0, LOCK_BANK_MAX - lockBankItems.length);
    if (!remaining) {
      setLockNotice(`You can save up to ${LOCK_BANK_MAX} pictures.`);
      return;
    }

    setBankBusy(true);
    try {
      const prepared = [];
      for (let i = 0; i < validImages.length; i += 1) {
        const file = validImages[i];
        const signature = await buildFileSignature(file);
        if (existingSigs.has(signature)) continue;
        existingSigs.add(signature);
        prepared.push({ file, signature });
      }
      const accepted = prepared.slice(0, remaining);
      if (accepted.length) {
        await addVaultFiles(
          accepted.map((entry) => ({
            file: entry.file,
            name: entry.file.name || "Saved picture",
            type: entry.file.type || "image/*",
            source: LOCK_BANK_SOURCE,
            meta: {
              category: LOCK_BANK_SOURCE,
              signature: entry.signature
            }
          })),
          {
            source: LOCK_BANK_SOURCE,
            meta: { category: LOCK_BANK_SOURCE }
          }
        );
      }
      await loadLockBankItems();

      const notices = [];
      if (invalidCount > 0) {
        notices.push(`${invalidCount} non-image file${invalidCount === 1 ? "" : "s"} ignored.`);
      }
      const duplicates = prepared.length < validImages.length ? validImages.length - prepared.length : 0;
      if (duplicates > 0) {
        notices.push(`${duplicates} duplicate image${duplicates === 1 ? "" : "s"} skipped.`);
      }
      const overflow = prepared.length - accepted.length;
      if (overflow > 0) {
        notices.push(`${overflow} extra image${overflow === 1 ? "" : "s"} not saved (max ${LOCK_BANK_MAX}).`);
      }
      if (accepted.length) {
        notices.unshift(`${accepted.length} picture${accepted.length === 1 ? "" : "s"} saved.`);
      }
      if (notices.length) {
        setLockNotice(notices.join(" "));
      }
    } catch (err) {
      setLockError(err?.message || "Unable to save pictures.");
    } finally {
      setBankBusy(false);
    }
  };

  const handlePickFromSaved = (item) => {
    if (!item?.signature || !(item.blob instanceof Blob)) return;
    if (pickerBusy || bankBusy || lockBusy) return;
    setLockError("");
    setLockNotice("");
    const selection = {
      id: `vault-bank-${item.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      signature: item.signature,
      file: null,
      blob: item.blob,
      previewUrl: URL.createObjectURL(item.blob),
      label: item.name || "Saved picture",
      type: item.type || item.blob.type || "image/*"
    };
    appendSelectedEntries([selection]);
  };

  const handleRemoveSavedPicture = async (id) => {
    setLockError("");
    setLockNotice("");
    setBankBusy(true);
    try {
      await removeVaultItem(id);
      await loadLockBankItems();
    } catch (err) {
      setLockError(err?.message || "Unable to remove saved picture.");
    } finally {
      setBankBusy(false);
    }
  };

  const handleClearSavedPictures = async () => {
    if (!lockBankItems.length) return;
    const ok = window.confirm(`Clear all saved lock pictures? (${lockBankItems.length})`);
    if (!ok) return;
    setBankBusy(true);
    setLockError("");
    setLockNotice("");
    try {
      await Promise.all(lockBankItems.map((item) => removeVaultItem(item.id)));
      await loadLockBankItems();
    } catch (err) {
      setLockError(err?.message || "Unable to clear saved pictures.");
    } finally {
      setBankBusy(false);
    }
  };

  const handleRemoveSelected = (index) => {
    setLockError("");
    setLockNotice("");
    setSelectedEntries((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      const removed = prev[index];
      revokeEntryPreview(removed);
      return next;
    });
  };

  const handleCreateLock = async () => {
    if (lockBusy || pickerBusy || bankBusy) return;
    const normalized = sanitizeSelection(selectedSignatures);
    if (normalized.length !== LOCK_PICK_COUNT) {
      setLockError(`Pick exactly ${LOCK_PICK_COUNT} pictures.`);
      return;
    }
    if (!isConfirmStage) {
      setPrimarySignatures(normalized);
      clearSelectedEntries();
      setSetupStage("confirm");
      setLockError("");
      setLockNotice("Now upload the same 5 pictures again in the same order.");
      return;
    }
    if (!isSameSelection(normalized, sanitizeSelection(primarySignatures))) {
      setLockError("Pictures do not match. Please start over.");
      setSetupStage("pick");
      setPrimarySignatures([]);
      clearSelectedEntries();
      return;
    }
    setLockBusy(true);
    setLockError("");
    setLockNotice("");
    try {
      if (saveLockPictures) {
        const lockFiles = selectedEntries.map((entry) => ({
          file:
            entry.file instanceof File
              ? entry.file
              : new File([entry.blob], entry.label || "Lock picture", {
                type: entry.type || entry.blob?.type || "image/*"
              }),
          name: entry.label || entry.file?.name || "Lock picture",
          type: entry.type || entry.file?.type || entry.blob?.type || "image/*",
          source: "vault-lock",
          meta: {
            category: "vault-lock"
          }
        }));
        if (lockFiles.length) {
          await addVaultFiles(lockFiles, {
            source: "vault-lock",
            meta: { category: "vault-lock" }
          });
        }
      }
      const nextLock = {
        fileSignatures: normalized,
        createdAt: Date.now()
      };
      const persisted = await saveVaultLockSynced(nextLock);
      setVaultUnlocked(persisted);
      setLock(persisted);
      setUnlocked(true);
      navigate("/storage", { replace: true });
    } catch (err) {
      setLockError(err?.message || "Unable to create vault lock.");
    } finally {
      setLockBusy(false);
    }
  };

  const handleUnlock = () => {
    if (lockBusy || pickerBusy || bankBusy || !lock) return;
    if (legacyLock) {
      setLockError("This lock uses the old gallery method. Reset lock and set it again using device pictures.");
      return;
    }
    const normalized = sanitizeSelection(selectedSignatures);
    if (normalized.length !== LOCK_PICK_COUNT) {
      setLockError(`Select ${LOCK_PICK_COUNT} pictures to unlock.`);
      return;
    }
    if (!isSameSelection(normalized, sanitizeSelection(lock.fileSignatures))) {
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

  const handleResetLock = async () => {
    const ok = window.confirm(
      `Reset vault lock? Your stored files stay, but you must choose ${LOCK_PICK_COUNT} new pictures.`
    );
    if (!ok) return;
    setLockBusy(true);
    setLockNotice("");
    clearVaultUnlocked();
    try {
      await clearVaultLockSynced();
      setLock(null);
      setUnlocked(false);
    } finally {
      setLockBusy(false);
    }
  };

  if (!lockLoaded) {
    return (
      <div className="storage-page">
        <div className="storage-shell">
          <header className="storage-top">
            <div className="storage-top-copy">
              <h1>Storage Vault</h1>
              <p className="storage-subtitle">Loading your vault lock…</p>
            </div>
          </header>
        </div>
      </div>
    );
  }

  const selectionCount = `${selectedEntries.length}/${LOCK_PICK_COUNT}`;
  const selectionHint = isSetupMode
    ? (isConfirmStage
      ? `Confirm the same ${LOCK_PICK_COUNT} pictures in the same order (${selectionCount}). Tap X on a slot to remove.`
      : `Upload ${LOCK_PICK_COUNT} pictures from your device in order (${selectionCount}). Tap X on a slot to remove.`)
    : `Upload your ${LOCK_PICK_COUNT} lock pictures in the same order (${selectionCount}). Tap X on a slot to remove.`;

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
                ? `Choose ${LOCK_PICK_COUNT} secret pictures from your device. You will confirm the same ${LOCK_PICK_COUNT} pictures in the same order to set the lock.`
                : `Upload your ${LOCK_PICK_COUNT} secret pictures from your device in the same order to open the vault.`}
            </p>
          </div>

          <p className="vault-empty">{selectionHint}</p>
          <div className="vault-picker-row">
            <button
              type="button"
              className="vault-picker-btn"
              onClick={openPicker}
              disabled={pickerBusy || bankBusy || lockBusy || unsupported}
            >
              {pickerBusy ? "Processing..." : "Upload Pictures"}
            </button>
            <button
              type="button"
              className="vault-picker-btn secondary"
              onClick={clearSelectedEntries}
              disabled={pickerBusy || bankBusy || !selectedEntries.length}
            >
              Clear Selected
            </button>
            <input
              ref={pickerInputRef}
              className="vault-picker-input"
              type="file"
              accept="image/*"
              multiple
              onChange={handleSelectFiles}
            />
          </div>

          {isSetupMode && (
            <label className="vault-save-choice">
              <input
                type="checkbox"
                checked={saveLockPictures}
                onChange={(event) => setSaveLockPictures(event.target.checked)}
              />
              <span>Save these lock pictures in this browser vault after setup (optional).</span>
            </label>
          )}

          <div className="vault-selected">
            {Array.from({ length: LOCK_PICK_COUNT }).map((_, index) => {
              const entry = selectedEntries[index];
              return (
                <button
                  key={`selected-${index}`}
                  type="button"
                  className={`vault-selected-slot ${entry ? "has" : ""}`}
                  onClick={() => entry && handleRemoveSelected(index)}
                  title={entry ? "Remove selection" : `Slot ${index + 1}`}
                  aria-label={entry ? `Remove selection ${index + 1}` : `Slot ${index + 1}`}
                >
                  {entry ? (
                    <>
                      <img src={entry.previewUrl} alt={entry.label} loading="lazy" />
                      <span className="vault-selected-index">{index + 1}</span>
                      <span className="vault-selected-remove" aria-hidden="true">X</span>
                    </>
                  ) : (
                    <span className="vault-selected-placeholder">{index + 1}</span>
                  )}
                </button>
              );
            })}
          </div>

          {lockNotice && <p className="vault-note">{lockNotice}</p>}
          {isUnlockMode && legacyLock && (
            <p className="vault-error">
              This lock was created with the old gallery pictures. Reset lock once, then set your new device pictures.
            </p>
          )}
          {lockError && <p className="vault-error">{lockError}</p>}
          {unsupported && (
            <p className="vault-error">Storage is not supported in this browser.</p>
          )}

          <div className="vault-actions">
            {isSetupMode ? (
              <button type="button" onClick={handleCreateLock} disabled={lockBusy || unsupported || pickerBusy || bankBusy}>
                {lockBusy ? "Creating..." : (isConfirmStage ? "Create Vault Lock" : "Next: Confirm Pictures")}
              </button>
            ) : (
              <button type="button" onClick={handleUnlock} disabled={lockBusy || unsupported || pickerBusy || bankBusy || legacyLock}>
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

          <section className="vault-bank">
            <div className="vault-bank-head">
              <div>
                <h4>Saved Lock Pictures ({lockBankItems.length}/{LOCK_BANK_MAX})</h4>
                <p>Select from saved pictures or upload and save up to {LOCK_BANK_MAX}.</p>
              </div>
              <div className="vault-bank-actions">
                <button
                  type="button"
                  className="vault-picker-btn"
                  onClick={openLockBankPicker}
                  disabled={pickerBusy || bankBusy || lockBusy || unsupported || lockBankItems.length >= LOCK_BANK_MAX}
                >
                  {bankBusy ? "Saving..." : "Save Pictures"}
                </button>
                <button
                  type="button"
                  className="vault-picker-btn secondary"
                  onClick={handleClearSavedPictures}
                  disabled={pickerBusy || bankBusy || !lockBankItems.length}
                >
                  Clear Saved
                </button>
                <input
                  ref={bankInputRef}
                  className="vault-picker-input"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleSaveLockBankFiles}
                />
              </div>
            </div>

            {!lockBankItems.length && (
              <p className="vault-empty">No saved pictures yet. Save up to {LOCK_BANK_MAX} from your device.</p>
            )}

            {!!lockBankItems.length && (
              <div className="vault-bank-grid">
                {lockBankItems.map((item) => (
                  <article className="vault-bank-card" key={`lock-bank-${item.id}`}>
                    <button
                      type="button"
                      className="vault-bank-thumb"
                      onClick={() => handlePickFromSaved(item)}
                      title={`Select ${item.name}`}
                    >
                      <img src={item.previewUrl} alt={item.name} loading="lazy" />
                    </button>
                    <div className="vault-bank-row">
                      <span>{item.name}</span>
                      <button
                        type="button"
                        className="vault-bank-remove"
                        onClick={() => handleRemoveSavedPicture(item.id)}
                        disabled={bankBusy}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </div>
    </div>
  );
}
