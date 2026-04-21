export const MAX_IMAGES_PER_MESSAGE = 4;

/** Hard guard for absurdly large inputs before decode/compress. */
export const MAX_IMAGE_INPUT_BYTES = 30 * 1024 * 1024; // 30MB

/** Target max compressed size per image. */
export const MAX_COMPRESSED_IMAGE_BYTES = 900 * 1024; // 900KB

/** If original is already small enough AND within pixel bounds, skip re-encoding. */
export const MAX_IMAGE_SKIP_BYTES = 1024 * 1024; // 1MB
export const MAX_IMAGE_LONG_EDGE_SKIP_PX = 1536;

/** When compressing, scale so the longest side equals this (downscale only). */
export const MAX_IMAGE_LONG_EDGE_ENCODE_PX = 1536;

const WEBP_PRIMARY_QUALITY = 0.85;
const JPEG_PRIMARY_QUALITY = 0.82;

const WEBP_FALLBACK_QUALITIES = [
  WEBP_PRIMARY_QUALITY,
  0.78,
  0.72,
  0.66,
  0.6,
  0.54,
  0.48,
  0.42,
];
const JPEG_FALLBACK_QUALITIES = [
  JPEG_PRIMARY_QUALITY,
  0.76,
  0.7,
  0.64,
  0.58,
  0.52,
  0.46,
  0.4,
];

async function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image'));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function withExtension(name: string, ext: string): string {
  const i = name.lastIndexOf('.');
  const base = i > 0 ? name.slice(0, i) : name;
  return `${base}.${ext}`;
}

function computeEncodeDimensions(width: number, height: number, longEdgePx: number): { width: number; height: number } {
  const maxSide = Math.max(width, height);
  if (maxSide <= longEdgePx) {
    return { width, height };
  }
  const scale = longEdgePx / maxSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function encodeCanvasUnderBudget(
  canvas: HTMLCanvasElement,
  targetBytes: number,
): Promise<{ blob: Blob; mime: string } | null> {
  // Try WebP first (preferred)
  for (const q of WEBP_FALLBACK_QUALITIES) {
    const blob = await toBlob(canvas, 'image/webp', q);
    if (blob && blob.size <= targetBytes) {
      return { blob, mime: 'image/webp' };
    }
  }

  // Fallback to JPEG
  for (const q of JPEG_FALLBACK_QUALITIES) {
    const blob = await toBlob(canvas, 'image/jpeg', q);
    if (blob && blob.size <= targetBytes) {
      return { blob, mime: 'image/jpeg' };
    }
  }

  return null;
}

async function shrinkCanvasUntilUnderBudget(
  source: HTMLImageElement,
  startW: number,
  startH: number,
  targetBytes: number,
): Promise<{ blob: Blob; mime: string; width: number; height: number } | null> {
  let w = startW;
  let h = startH;
  const minLongEdge = 640;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, w, h);

    const encoded = await encodeCanvasUnderBudget(canvas, targetBytes);
    if (encoded) {
      return { ...encoded, width: w, height: h };
    }

    const longEdge = Math.max(w, h);
    if (longEdge <= minLongEdge) {
      break;
    }

    const factor = 0.92;
    w = Math.max(1, Math.round(w * factor));
    h = Math.max(1, Math.round(h * factor));
  }

  return null;
}

export async function prepareImageForUpload(file: File): Promise<{ file?: File; error?: string }> {
  if (!file.type.startsWith('image/')) {
    return { error: 'Only image files are allowed.' };
  }
  if (file.size > MAX_IMAGE_INPUT_BYTES) {
    return { error: 'Image is too large.' };
  }

  const img = await loadImage(file);
  const maxSide = Math.max(img.width, img.height);

  const canSkip =
    file.size < MAX_IMAGE_SKIP_BYTES &&
    maxSide <= MAX_IMAGE_LONG_EDGE_SKIP_PX;

  if (canSkip) {
    return { file };
  }

  const { width, height } = computeEncodeDimensions(img.width, img.height, MAX_IMAGE_LONG_EDGE_ENCODE_PX);
  const encoded = await shrinkCanvasUntilUnderBudget(img, width, height, MAX_COMPRESSED_IMAGE_BYTES);
  if (!encoded) {
    return { error: 'Image remains too large after compression.' };
  }

  const ext = encoded.mime === 'image/jpeg' ? 'jpg' : 'webp';
  const outName = withExtension(file.name || `image-${Date.now()}`, ext);
  const outFile = new File([encoded.blob], outName, { type: encoded.mime, lastModified: Date.now() });
  return { file: outFile };
}
