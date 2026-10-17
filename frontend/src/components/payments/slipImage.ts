/**
 * Prepare a bank-transfer slip photo for POST /payments/slips.
 *
 * The backend stores `slipImageUrl` as-is and admins open it to verify the
 * transfer, so a `blob:` preview URL (only valid in this tab) is useless to
 * them. We downscale the photo to a JPEG data URL that fits comfortably inside
 * the API's 2 MB JSON limit.
 */

export const SLIP_MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 1600;
const MAX_DATA_URL_CHARS = 1_200_000; // ~0.9 MB of JPEG

export class SlipImageError extends Error {}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new SlipImageError('เปิดรูปนี้ไม่ได้ ลองใช้ไฟล์ JPG หรือ PNG'));
    };
    img.src = url;
  });
}

export function validateSlipFile(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'แนบได้เฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP)';
  if (file.size > SLIP_MAX_INPUT_BYTES) return 'ไฟล์ใหญ่เกิน 10 MB';
  return null;
}

export async function slipToDataUrl(file: File): Promise<string> {
  const problem = validateSlipFile(file);
  if (problem) throw new SlipImageError(problem);

  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new SlipImageError('เบราว์เซอร์นี้ย่อรูปไม่ได้ ลองใช้เบราว์เซอร์อื่น');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  for (const quality of [0.82, 0.7, 0.58, 0.45]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_DATA_URL_CHARS) return dataUrl;
  }
  throw new SlipImageError('รูปสลิปมีรายละเอียดมากเกินไป ลองครอปให้เหลือเฉพาะสลิป');
}
