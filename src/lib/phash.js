// A flyer's fingerprint: a 64-bit difference hash. The image is shrunk to
// 9×8 greyscale and each bit records whether a pixel is brighter than the
// one to its right, so the same flyer re-saved, resized or recompressed by
// Instagram lands within a few bits of the original. Stored as 16 hex
// characters; the database compares them (find_flyer_matches).

// grey: 72 brightness values, row by row, 9 wide and 8 tall.
export function dHashFromGrey(grey) {
  let hex = "";
  for (let row = 0; row < 8; row++) {
    let byte = 0;
    for (let col = 0; col < 8; col++) {
      const i = row * 9 + col;
      byte = (byte << 1) | (grey[i] > grey[i + 1] ? 1 : 0);
    }
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

export function hammingHex(a, b) {
  let bits = 0;
  for (let i = 0; i < 16; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
  }
  return bits;
}

// In the browser, from an image File. Null if it can't be decoded.
export async function flyerHash(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = 9;
    canvas.height = 8;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, 9, 8);
    bitmap.close?.();
    const { data } = ctx.getImageData(0, 0, 9, 8);
    const grey = [];
    for (let i = 0; i < data.length; i += 4) {
      grey.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }
    return dHashFromGrey(grey);
  } catch {
    return null;
  }
}
