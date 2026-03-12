import html2canvas from 'html2canvas';

/**
 * Capture the current page as a compressed JPEG base64 string.
 * Excludes the feedback panel itself (via data-feedback-panel attribute).
 *
 * @returns {Promise<string|null>} base64 data URL or null on failure
 */
export async function captureScreen() {
  try {
    const canvas = await html2canvas(document.body, {
      useCORS: true,
      allowTaint: true,
      scale: 1,
      logging: false,
      ignoreElements: (el) => el.hasAttribute('data-feedback-panel'),
    });
    return compressCanvas(canvas, 800, 0.6);
  } catch (err) {
    console.warn('Screenshot capture failed:', err);
    return null;
  }
}

/**
 * Compress an image File/Blob to a max-width JPEG base64 string.
 *
 * @param {File|Blob} file
 * @param {number} maxWidth
 * @param {number} quality JPEG quality 0-1
 * @returns {Promise<string>} base64 data URL
 */
export function compressImage(file, maxWidth = 800, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Resize a canvas to maxWidth and export as JPEG base64.
 */
function compressCanvas(canvas, maxWidth = 800, quality = 0.6) {
  const scale = Math.min(1, maxWidth / canvas.width);
  if (scale < 1) {
    const resized = document.createElement('canvas');
    resized.width = canvas.width * scale;
    resized.height = canvas.height * scale;
    const ctx = resized.getContext('2d');
    ctx.drawImage(canvas, 0, 0, resized.width, resized.height);
    return resized.toDataURL('image/jpeg', quality);
  }
  return canvas.toDataURL('image/jpeg', quality);
}
