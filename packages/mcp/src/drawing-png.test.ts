import { inflateSync } from 'node:zlib';
import type { DrawingData } from '@openkeep/shared';
import { describe, expect, it } from 'vitest';
import { renderDrawingPng } from './drawing-png.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface Decoded {
  width: number;
  height: number;
  pixel: (x: number, y: number) => [number, number, number];
}

/**
 * A deliberately independent PNG reader: walking the chunks and undoing the
 * filtering here is what proves the encoder wrote a real file, which reusing
 * its own code could not.
 */
function decodePng(png: Buffer): Decoded {
  expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);

  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  const seen: string[] = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('latin1');
    const data = png.subarray(offset + 8, offset + 8 + length);
    seen.push(type);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect(data[8]).toBe(8); // 8 bits per channel
      expect(data[9]).toBe(2); // truecolour, no alpha
      expect(data[12]).toBe(0); // not interlaced
    }
    if (type === 'IDAT') idat.push(Buffer.from(data));
    offset += 12 + length;
  }
  expect(seen[0]).toBe('IHDR');
  expect(seen.at(-1)).toBe('IEND');
  expect(offset).toBe(png.length);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 3;
  expect(raw.length).toBe((stride + 1) * height);

  return {
    width,
    height,
    pixel: (x, y) => {
      const row = y * (stride + 1);
      expect(raw[row]).toBe(0); // filter type `None`
      const base = row + 1 + x * 3;
      return [raw[base] ?? 0, raw[base + 1] ?? 0, raw[base + 2] ?? 0];
    },
  };
}

function drawing(partial: Partial<DrawingData> = {}): DrawingData {
  return {
    version: 1,
    width: 120,
    height: 80,
    background: 'none',
    strokes: [],
    ...partial,
  };
}

describe('renderDrawingPng', () => {
  it('writes a decodable PNG of the declared size, on white paper', () => {
    const png = decodePng(renderDrawingPng(drawing({ width: 64, height: 48 })));
    expect(png.width).toBe(64);
    expect(png.height).toBe(48);
    expect(png.pixel(0, 0)).toEqual([255, 255, 255]);
    expect(png.pixel(63, 47)).toEqual([255, 255, 255]);
  });

  it('paints an opaque stroke along its path and nowhere else', () => {
    const png = decodePng(
      renderDrawingPng(
        drawing({
          strokes: [{ tool: 'pen', color: '#000000', size: 8, points: [10, 40, 110, 40] }],
        }),
      ),
    );
    expect(png.pixel(60, 40)).toEqual([0, 0, 0]);
    // Well clear of the 8px band, and past the round cap at the near end.
    expect(png.pixel(60, 10)).toEqual([255, 255, 255]);
    expect(png.pixel(2, 40)).toEqual([255, 255, 255]);
  });

  it('keeps a stroke’s own colour', () => {
    const png = decodePng(
      renderDrawingPng(
        drawing({
          strokes: [{ tool: 'marker', color: '#FF5252', size: 10, points: [20, 40, 100, 40] }],
        }),
      ),
    );
    expect(png.pixel(60, 40)).toEqual([0xff, 0x52, 0x52]);
  });

  it('draws a lone point as a dot', () => {
    const png = decodePng(
      renderDrawingPng(
        drawing({ strokes: [{ tool: 'pen', color: '#000000', size: 12, points: [60, 40] }] }),
      ),
    );
    expect(png.pixel(60, 40)).toEqual([0, 0, 0]);
    expect(png.pixel(60, 20)).toEqual([255, 255, 255]);
  });

  it('lets the highlighter show the paper through, and never darkens itself twice', () => {
    const single = decodePng(
      renderDrawingPng(
        drawing({
          strokes: [{ tool: 'highlighter', color: '#000000', size: 20, points: [10, 40, 110, 40] }],
        }),
      ),
    ).pixel(60, 40);

    // 45% of black over white paper — translucent, not solid.
    expect(single[0]).toBeGreaterThan(120);
    expect(single[0]).toBeLessThan(150);

    // The same stroke doubling back over itself is one pass, so the overlap
    // comes out the same shade rather than twice as dark.
    const doubledBack = decodePng(
      renderDrawingPng(
        drawing({
          strokes: [
            {
              tool: 'highlighter',
              color: '#000000',
              size: 20,
              points: [10, 40, 110, 40, 10, 40],
            },
          ],
        }),
      ),
    ).pixel(60, 40);
    expect(doubledBack).toEqual(single);
  });

  it('lays later strokes over earlier ones', () => {
    const png = decodePng(
      renderDrawingPng(
        drawing({
          strokes: [
            { tool: 'pen', color: '#000000', size: 20, points: [10, 40, 110, 40] },
            { tool: 'pen', color: '#FFFFFF', size: 10, points: [10, 40, 110, 40] },
          ],
        }),
      ),
    );
    expect(png.pixel(60, 40)).toEqual([255, 255, 255]);
  });

  it('rules the paper when a pattern is asked for', () => {
    const plain = decodePng(renderDrawingPng(drawing({ background: 'none' })));
    const ruled = decodePng(renderDrawingPng(drawing({ background: 'rules' })));
    expect(plain.pixel(60, 32)).toEqual([255, 255, 255]);
    // Ruled paper steps by 32px, so the first line lands on row 32.
    expect(ruled.pixel(60, 32)[0]).toBeLessThan(255);
    expect(ruled.pixel(60, 20)).toEqual([255, 255, 255]);
  });

  it('refuses work it should not be doing, pointing at the alternative', () => {
    expect(() =>
      renderDrawingPng(
        drawing({
          width: 8000,
          height: 8000,
          strokes: Array.from({ length: 200 }, () => ({
            tool: 'pen' as const,
            color: '#000000',
            size: 200,
            points: Array.from({ length: 4000 }, (_, i) => i % 7000),
          })),
        }),
      ),
    ).toThrow('png_base64');
  });
});
