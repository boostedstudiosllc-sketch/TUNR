// What a picked receipt file is (Perks → Upload a receipt). People can take a
// photo, pick one from their phone, or attach a PDF invoice. Photos are shrunk
// before upload; PDFs go up as they are, up to MAX_RECEIPT_PDF.

export const RECEIPT_ACCEPT = "image/*,application/pdf,.pdf";
export const MAX_RECEIPT_PDF = 10 * 1024 * 1024;

// { kind: "image" | "pdf", ext, contentType } or { error }
export function receiptKind(file) {
  if (!file) return { error: "Add the receipt or invoice: a photo or a PDF." };
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  if (type === "application/pdf" || (!type && name.endsWith(".pdf"))) {
    if (file.size > MAX_RECEIPT_PDF) return { error: `That PDF is ${Math.ceil(file.size / 1048576)} MB. Receipts can be up to 10 MB.` };
    return { kind: "pdf", ext: "pdf", contentType: "application/pdf" };
  }
  if (type.startsWith("image/") || (!type && /\.(jpe?g|png|heic|heif|webp|gif)$/.test(name))) {
    return { kind: "image", ext: "jpg", contentType: "image/jpeg" };
  }
  return { error: `That file (${file.name || type || "unknown type"}) isn't a photo or a PDF. Pick a photo of the receipt or a PDF invoice.` };
}
