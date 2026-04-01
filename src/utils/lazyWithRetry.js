const RETRY_STORAGE_PREFIX = "socialsea_lazy_retry_v1:";

export const isRetryableChunkError = (error) => {
  const message = String(error?.message || error || "").trim().toLowerCase();
  if (!message) return false;
  return (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("loading chunk") ||
    message.includes("chunkloaderror")
  );
};

export const lazyWithRetry = (importer, retryId = "page") => {
  if (typeof importer !== "function") {
    throw new TypeError("lazyWithRetry requires an import function.");
  }

  return async () => {
    const storageKey = `${RETRY_STORAGE_PREFIX}${String(retryId || "page").trim().toLowerCase()}`;

    try {
      const module = await importer();
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.removeItem(storageKey);
        } catch {
          // Ignore storage failures so the page can still load.
        }
      }
      return module;
    } catch (error) {
      if (typeof window !== "undefined" && isRetryableChunkError(error)) {
        let alreadyRetried = false;
        try {
          alreadyRetried = window.sessionStorage.getItem(storageKey) === "1";
        } catch {
          alreadyRetried = false;
        }

        if (!alreadyRetried) {
          try {
            window.sessionStorage.setItem(storageKey, "1");
          } catch {
            // Ignore storage failures and still attempt the reload.
          }
          window.location.reload();
          await new Promise(() => {});
        }
      }

      throw error;
    }
  };
};
