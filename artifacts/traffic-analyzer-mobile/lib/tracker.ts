/**
 * IoU-based centroid tracker — ported from the web app tracker.ts.
 * Pure TypeScript, no browser dependencies.
 */

export interface Detection {
  classId: number;
  className: string;
  score: number;
  /** Normalised [x1, y1, x2, y2] */
  bboxNorm: [number, number, number, number];
}

export interface TrackedObject {
  id: string;
  classId: number;
  className: string;
  confidence: number;
  /** Normalised [x1, y1, x2, y2] */
  bbox: [number, number, number, number];
  /** Centroid [cx, cy] in normalised coords */
  centroid: [number, number];
  /** Recent centroid positions with timestamps (ms) */
  history: Array<{ cx: number; cy: number; ts: number }>;
  /** Estimated speed in km/h (null until enough history) */
  speedKph: number | null;
  missedFrames: number;
  /** Has this object already been counted? */
  counted: boolean;
}

const MAX_HISTORY  = 30;
const MAX_MISSED   = 8;
const IOU_MATCH    = 0.25;

let trackIdCounter = 0;

function centroid(b: [number, number, number, number]): [number, number] {
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
}

function iou(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  const xi1 = Math.max(a[0], b[0]);
  const yi1 = Math.max(a[1], b[1]);
  const xi2 = Math.min(a[2], b[2]);
  const yi2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, xi2 - xi1) * Math.max(0, yi2 - yi1);
  if (inter === 0) return 0;
  const aA = (a[2] - a[0]) * (a[3] - a[1]);
  const bA = (b[2] - b[0]) * (b[3] - b[1]);
  return inter / (aA + bA - inter);
}

function computeSpeed(
  history: TrackedObject['history'],
  pixelsPerMeter: number,
  frameWidth: number,
  frameHeight: number,
): number | null {
  if (history.length < 4) return null;
  const latest = history[history.length - 1];
  let windowStart = -1;
  for (let i = history.length - 2; i >= 0; i--) {
    if (latest.ts - history[i].ts >= 300) { windowStart = i; break; }
  }
  if (windowStart < 0) return null;
  const old = history[windowStart];
  const dtSec = (latest.ts - old.ts) / 1000;
  if (dtSec <= 0) return null;
  const dxPx = (latest.cx - old.cx) * frameWidth;
  const dyPx = (latest.cy - old.cy) * frameHeight;
  const dPx  = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
  const dM   = dPx / pixelsPerMeter;
  return (dM / dtSec) * 3.6; // km/h
}

export class Tracker {
  private tracks: Map<string, TrackedObject> = new Map();

  update(
    detections: Detection[],
    now: number,
    pixelsPerMeter: number,
    frameWidth: number,
    frameHeight: number,
  ): { tracks: TrackedObject[]; newlyCounted: TrackedObject[] } {
    const matched  = new Set<string>();
    const usedDets = new Set<number>();
    const newlyCounted: TrackedObject[] = [];

    // Match detections → existing tracks by IoU
    for (const track of this.tracks.values()) {
      let bestIoU = IOU_MATCH;
      let bestDet = -1;
      detections.forEach((det, di) => {
        if (usedDets.has(di) || det.classId !== track.classId) return;
        const score = iou(det.bboxNorm, track.bbox);
        if (score > bestIoU) { bestIoU = score; bestDet = di; }
      });

      if (bestDet >= 0) {
        const det = detections[bestDet];
        usedDets.add(bestDet);
        matched.add(track.id);
        const [cx, cy] = centroid(det.bboxNorm);
        track.history.push({ cx, cy, ts: now });
        if (track.history.length > MAX_HISTORY) track.history.shift();
        track.bbox        = det.bboxNorm;
        track.centroid    = [cx, cy];
        track.confidence  = det.score;
        track.missedFrames = 0;
        track.speedKph    = computeSpeed(track.history, pixelsPerMeter, frameWidth, frameHeight);
      } else {
        track.missedFrames++;
      }
    }

    // Create new tracks for unmatched detections
    detections.forEach((det, di) => {
      if (usedDets.has(di)) return;
      const [cx, cy] = centroid(det.bboxNorm);
      const track: TrackedObject = {
        id:           `t${++trackIdCounter}`,
        classId:      det.classId,
        className:    det.className,
        confidence:   det.score,
        bbox:         det.bboxNorm,
        centroid:     [cx, cy],
        history:      [{ cx, cy, ts: now }],
        speedKph:     null,
        missedFrames: 0,
        counted:      false,
      };
      this.tracks.set(track.id, track);
    });

    // Count newly stable objects
    for (const track of this.tracks.values()) {
      if (!track.counted && track.history.length >= 3 && track.missedFrames === 0) {
        track.counted = true;
        newlyCounted.push(track);
      }
    }

    // Prune lost tracks
    for (const [id, track] of this.tracks) {
      if (track.missedFrames > MAX_MISSED) this.tracks.delete(id);
    }

    return {
      tracks: Array.from(this.tracks.values()).filter((t) => t.missedFrames === 0),
      newlyCounted,
    };
  }

  reset(): void {
    this.tracks.clear();
  }
}
