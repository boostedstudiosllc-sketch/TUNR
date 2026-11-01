import test from "node:test";
import assert from "node:assert/strict";
import { receiptKind, RECEIPT_ACCEPT, MAX_RECEIPT_PDF } from "../src/lib/receiptFile.js";

const file = (name, type, size = 1000) => ({ name, type, size });

test("photos from the camera or the photo library are images", () => {
  assert.equal(receiptKind(file("IMG_0001.JPG", "image/jpeg")).kind, "image");
  assert.equal(receiptKind(file("IMG_0002.HEIC", "image/heic")).kind, "image");
  assert.equal(receiptKind(file("Screenshot.png", "")).kind, "image", "no type, but a photo name");
});

test("a PDF invoice goes up as a PDF", () => {
  assert.deepEqual(receiptKind(file("invoice.pdf", "application/pdf")), { kind: "pdf", ext: "pdf", contentType: "application/pdf" });
  assert.equal(receiptKind(file("Invoice.PDF", "")).kind, "pdf");
});

test("too big a PDF, or another kind of file, says why", () => {
  assert.match(receiptKind(file("big.pdf", "application/pdf", MAX_RECEIPT_PDF + 1)).error, /up to 10 MB/);
  assert.match(receiptKind(file("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).error, /notes\.docx.*photo or a PDF/);
  assert.match(receiptKind(null).error, /photo or a PDF/);
});

test("the picker offers photos and PDFs", () => {
  assert.match(RECEIPT_ACCEPT, /image\/\*/);
  assert.match(RECEIPT_ACCEPT, /application\/pdf/);
});
