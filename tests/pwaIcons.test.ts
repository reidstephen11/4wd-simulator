import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  expect(buf.subarray(0, 8).equals(PNG)).toBe(true);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('PWA icons', () => {
  test('the home-screen icons are the required PNG sizes', () => {
    expect(pngSize('public/pwa-192x192.png')).toEqual({ width: 192, height: 192 });
    expect(pngSize('public/pwa-512x512.png')).toEqual({ width: 512, height: 512 });
    expect(pngSize('public/pwa-512x512-maskable.png')).toEqual({ width: 512, height: 512 });
    expect(pngSize('public/apple-touch-icon.png')).toEqual({ width: 180, height: 180 });
  });
});
