import jsQR from './vendor/jsQR.cjs';

export function decodeRaster({ width, height, gray }) {
  const pixels = Buffer.from(gray, 'base64');
  const rgba = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let i = 0; i < pixels.length; i++) rgba.fill(pixels[i], i * 4, i * 4 + 3);
  return jsQR(rgba, width, height, { inversionAttempts: 'dontInvert' })?.data;
}

export function decodeMatrix(modules, margin = 4) {
  const scale = 4, width = (modules.length + margin * 2) * scale;
  const pixels = Buffer.alloc(width * width, 255);
  modules.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) for (let dy = 0; dy < scale; dy++) {
      const offset = ((y + margin) * scale + dy) * width + (x + margin) * scale;
      pixels.fill(0, offset, offset + scale);
    }
  }));
  return decodeRaster({ width, height: width, gray: pixels.toString('base64') });
}
