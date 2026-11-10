// Grouped bar chart written as SVG, then turned into PNG with sharp.
import sharp from "sharp";

export type Series = { name: string; values: (number | null)[] }; // values are 0..1, null = not available

const COLORS = ["#2a6fb0", "#d9822b", "#4a9d6b", "#8a5fb5"];

export async function chartPng(file: string, title: string, subtitle: string, labels: string[], series: Series[]) {
  const W = 900, H = 480, L = 60, R = 20, T = 80, B = 70;
  const pw = W - L - R, ph = H - T - B;
  const gw = pw / labels.length;
  const bw = Math.min(40, (gw - 20) / series.length);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Arial, sans-serif">` +
    `<rect width="${W}" height="${H}" fill="#fff"/>` +
    `<text x="${L}" y="28" font-size="18" font-weight="bold">${esc(title)}</text>` +
    `<text x="${L}" y="50" font-size="12" fill="#a00">${esc(subtitle)}</text>`;
  for (let i = 0; i <= 5; i++) {
    const y = T + ph - (ph * i) / 5;
    s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#ddd"/><text x="${L - 8}" y="${y + 4}" font-size="11" text-anchor="end">${i * 20}%</text>`;
  }
  labels.forEach((lab, g) => {
    const x0 = L + g * gw + (gw - bw * series.length) / 2;
    series.forEach((se, i) => {
      const v = se.values[g];
      const x = x0 + i * bw;
      if (v === null) {
        s += `<text x="${x + bw / 2}" y="${T + ph - 6}" font-size="10" text-anchor="middle" fill="#888">n/a</text>`;
      } else {
        const h = ph * v;
        s += `<rect x="${x}" y="${T + ph - h}" width="${bw - 3}" height="${h}" fill="${COLORS[i % 4]}"/>` +
          `<text x="${x + (bw - 3) / 2}" y="${T + ph - h - 4}" font-size="11" text-anchor="middle">${Math.round(v * 100)}%</text>`;
      }
    });
    s += `<text x="${L + g * gw + gw / 2}" y="${T + ph + 18}" font-size="12" text-anchor="middle">${esc(lab)}</text>`;
  });
  series.forEach((se, i) => {
    s += `<rect x="${L + i * 130}" y="${H - 28}" width="12" height="12" fill="${COLORS[i % 4]}"/><text x="${L + i * 130 + 18}" y="${H - 18}" font-size="12">${esc(se.name)}</text>`;
  });
  s += "</svg>";
  await sharp(Buffer.from(s)).png().toFile(file);
}
