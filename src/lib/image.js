// Client-side downscale/recompress before upload, so a 12MP phone photo
// doesn't become a multi-MB Storage object. Falls back to the original file
// whenever decoding fails or compression doesn't actually help (e.g. GIFs,
// already-small images) — never blocks the upload.
export async function compressImage(file, { maxDim = 1600, quality = 0.82 } = {}) {
  if (!file.type || !file.type.startsWith("image/")) return file;
  if (file.type === "image/gif") return file; // preserve animation

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob || blob.size >= file.size) return file;

  const baseName = (file.name || "photo").replace(/\.[^./\\]+$/, "");
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}
