let browserImageCompressionPromise = null;
let heic2anyPromise = null;

const loadBrowserImageCompression = async () => {
  if (!browserImageCompressionPromise) {
    browserImageCompressionPromise = import("browser-image-compression").then((mod) => mod.default || mod);
  }
  return browserImageCompressionPromise;
};

const loadHeic2Any = async () => {
  if (!heic2anyPromise) {
    heic2anyPromise = import("heic2any").then((mod) => mod.default || mod);
  }
  return heic2anyPromise;
};

export function isHeicLikeFile(file) {
  if (!file) return false;
  const type = String(file.type || "").trim().toLowerCase();
  if (type.includes("heic") || type.includes("heif")) return true;
  const name = String(file.name || "").trim().toLowerCase();
  return /\.(heic|heif)$/i.test(name);
}

async function convertHeicToJpegFile(file) {
  const heic2any = await loadHeic2Any();
  if (typeof heic2any !== "function") throw new Error("HEIC converter not available");

  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  if (!(blob instanceof Blob) || blob.size <= 0) throw new Error("HEIC conversion failed");

  const originalName = String(file?.name || "image").replace(/\.[a-z0-9]+$/i, "");
  return new File([blob], `${originalName}.jpg`, {
    type: blob.type || "image/jpeg",
    lastModified: Date.now()
  });
}

function isAnimatedGifFile(file) {
  if (!file) return false;
  const type = String(file.type || "").trim().toLowerCase();
  if (type === "image/gif") return true;
  const name = String(file.name || "").trim().toLowerCase();
  return /\.gif$/i.test(name);
}

export async function compressImageFile(file, options = {}) {
  if (!file) return null;
  const type = String(file.type || "").trim().toLowerCase();
  if (!type.startsWith("image/")) return file;
  if (isAnimatedGifFile(file)) return file;

  let sourceFile = file;
  if (isHeicLikeFile(file)) {
    try {
      sourceFile = await convertHeicToJpegFile(file);
    } catch {
      sourceFile = file;
    }
  }

  try {
    const imageCompression = await loadBrowserImageCompression();
    if (typeof imageCompression !== "function") {
      return sourceFile;
    }

    const maxSizeMB = Number.isFinite(Number(options.maxSizeMB)) ? Number(options.maxSizeMB) : 1;
    const maxWidthOrHeight = Number.isFinite(Number(options.maxWidthOrHeight))
      ? Number(options.maxWidthOrHeight)
      : 1920;
    const initialQuality = Number.isFinite(Number(options.initialQuality)) ? Number(options.initialQuality) : 0.82;
    const fileType = String(options.fileType || "image/webp").trim() || "image/webp";

    return await imageCompression(sourceFile, {
      maxSizeMB,
      maxWidthOrHeight,
      initialQuality,
      fileType,
      useWebWorker: true
    });
  } catch {
    return sourceFile;
  }
}
