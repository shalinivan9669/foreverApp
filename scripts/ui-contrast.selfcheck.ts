import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/app/globals.css', 'utf8');
const tokens = new Map(Array.from(css.matchAll(/(--app-[\w-]+):\s*(#[\da-f]{6});/gi), (match) => [match[1], match[2]]));
const resolveTokens = (value: string) => value.replace(/var\((--app-[\w-]+)\)/g, (full: string, key: string) => tokens.get(key) ?? full);
const rule = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = css.match(new RegExp(`(?:^|\\n\\n)${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(found, `missing CSS rule ${selector}`);
  return resolveTokens(found[1]);
};
const color = (source: string) => {
  const found = source.match(/(?:^|;)\s*color:\s*(#[\da-f]{6})/i);
  assert.ok(found, 'CSS foreground must resolve to an opaque sRGB token');
  return found[1];
};
const stops = (source: string) => {
  const background = source.match(/(?:^|;)\s*background(?:-color)?:\s*([^;]+)/)?.[1];
  assert.ok(background, 'CSS background is required');
  return Array.from(background.matchAll(/#[\da-f]{6}/gi), (match) => match[0]);
};
const rgb = (value: string) => [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16) / 255);
const luminance = (channels: number[]) => channels
  .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (left: number[], right: number[]) => {
  const a = luminance(left); const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
function verify(name: string, foreground: string, backgrounds: string[]) {
  assert.ok(backgrounds.length > 0);
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < backgrounds.length; index += 1) {
    const from = rgb(backgrounds[index]);
    const to = rgb(backgrounds[Math.min(index + 1, backgrounds.length - 1)]);
    for (let sample = 0; sample <= 100; sample += 1) {
      const interpolated = from.map((value, channel) => value + (to[channel] - value) * sample / 100);
      minimum = Math.min(minimum, contrast(rgb(foreground), interpolated));
    }
  }
  assert.ok(minimum >= 4.5, `${name}: ${minimum.toFixed(3)}:1 is below 4.5:1`);
  console.log(`${name}: minimum ${minimum.toFixed(3)}:1`);
}

for (const name of ['primary', 'secondary', 'danger', 'success']) {
  const base = rule(`.app-btn-${name}`);
  verify(`${name} default`, color(base), stops(base));
  const hover = rule(`.app-btn-${name}:hover:not(:disabled):not([aria-disabled="true"])`);
  verify(`${name} hover`, color(base), stops(hover));
}
for (const name of ['rose', 'honey', 'mint', 'plum', 'spark', 'blush', 'aura']) {
  const variant = rule(`.app-tile-${name}`);
  verify(`tile ${name}`, name === 'spark' ? color(variant) : color(rule('.app-tile')), stops(variant));
}
const surfaces = ['--app-surface', '--app-surface-raised', '--app-surface-soft', '--app-bg', '--app-bg-accent'].map((token) => {
  const value = tokens.get(token); assert.ok(value); return value;
});
for (const token of ['--app-fg', '--app-muted', '--app-primary-strong', '--app-ring']) {
  const value = tokens.get(token); assert.ok(value); verify(token, value, surfaces);
}
console.log('UI contrast self-check passed (opaque CSS gradients/tokens; rendered states checked separately).');
