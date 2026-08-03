import { describe, expect, it } from 'vitest';
import { clampView, fitScale, fitView, MAX_ZOOM, panView, zoomAt } from './drawing-view.js';

const page = { width: 800, height: 600 };

describe('drawing viewport', () => {
  it('fits the whole page and centres the letterbox', () => {
    expect(fitView(page, 800, 1200)).toEqual({ scale: 1, offX: 0, offY: 300 });
  });

  it('the fit scale is the floor: zooming out further only adds margins', () => {
    const fit = fitScale(page, 400, 300);
    expect(fit).toBe(0.5);
    expect(clampView({ scale: 0.1, offX: 0, offY: 0 }, page, 400, 300).scale).toBe(fit);
    expect(clampView({ scale: 99, offX: 0, offY: 0 }, page, 400, 300).scale).toBe(MAX_ZOOM);
  });

  it('panning cannot park the paper off-screen', () => {
    const zoomed = { scale: 2, offX: 0, offY: 0 };
    // 1600px of page in a 800px container: the offset lives in [-800, 0].
    expect(panView(zoomed, page, 800, 600, 500, 0).offX).toBe(0);
    expect(panView(zoomed, page, 800, 600, -5000, 0).offX).toBe(-800);
  });

  it('panning an axis the page does not fill re-centres it instead', () => {
    const view = fitView(page, 800, 1200);
    expect(panView(view, page, 800, 1200, 0, -400).offY).toBe(300);
  });

  it('zooming keeps the page point under the cursor pinned', () => {
    const start = fitView(page, 800, 600);
    const next = zoomAt(start, page, 800, 600, 2, 200, 150);
    // The page point under (200, 150) was (200, 150); it must still be there.
    expect((200 - next.offX) / next.scale).toBeCloseTo(200);
    expect((150 - next.offY) / next.scale).toBeCloseTo(150);
  });

  it('zooming out to the floor re-centres rather than drifting', () => {
    const zoomed = zoomAt(fitView(page, 800, 600), page, 800, 600, 4, 0, 0);
    expect(zoomAt(zoomed, page, 800, 600, 0.01, 0, 0)).toEqual({ scale: 1, offX: 0, offY: 0 });
  });
});
