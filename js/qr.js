import qrcode from './vendor/qrcode-generator.mjs';
import { escapeHTML } from './ui.js';

export const QR_MARGIN = 4;

// Invite URLs are ASCII: Unicode names live in the Base64URL fragment.
// Generate locally; no invite data is sent to an image service.
export function createQR(text) {
  if (typeof text !== 'string' || !text.length || /[^\x20-\x7e]/.test(text)) throw new Error('QR에 담을 링크를 확인해 주세요.');
  const code = qrcode(0, 'M');
  code.addData(text, 'Byte');
  code.make();
  const size = code.getModuleCount();
  return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => code.isDark(y, x)));
}

export function qrSVG(text, label) {
  const modules = createQR(text);
  const edge = modules.length + QR_MARGIN * 2;
  const path = [];
  for (const [y, row] of modules.entries()) {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      const start = x;
      while (x + 1 < row.length && row[x + 1]) x++;
      path.push(`M${start + QR_MARGIN} ${y + QR_MARGIN}h${x - start + 1}v1H${start + QR_MARGIN}z`);
    }
  }
  // Four white modules around the code are required for reliable scanning.
  return `<svg xmlns="http://www.w3.org/2000/svg" class="invite-qr" viewBox="0 0 ${edge} ${edge}" width="${edge}" height="${edge}" role="img" aria-label="${escapeHTML(label)}" shape-rendering="crispEdges"><rect width="${edge}" height="${edge}" fill="#fff"/><path d="${path.join('')}" fill="#000"/></svg>`;
}
