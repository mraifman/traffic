/**
 * IoU-based centroid tracker.
 * Assigns stable IDs to detected objects across frames and accumulates
 * centroid history so the speed estimator can compute displacement.
 */
import { Detection } from './detector';

export interface TrackedObject {
  id: string;
  classId: number;
  className: string;
  confidence: number;
  /** Normalised [0..1] */
  bbox: [number, number, number, number];
  /** Centroid in normalised coords: [cx, cy] */
  centroid: [number, number];
  /** Recent centroid positions with timestamps (ms) */
  history: Array<{ cx: number; cy: number; ts: number }>;
  /** Estimated speed in km/h (null until we have enough history) */
  speedKph: number | null;
  /** Frames since last matched */
  missedFrames: number;
  /** Has this object already been counted? */
  counted: boolean;
}

const MAX_HISTORY = 30;          // max centroid samples kept
const MAX_MISSED  = 8;           // frames before track is dropped
const IOU_MATCH   = 0.25;        // min IoU to match an existing track

let trackIdCounter = 0;

function centroid(bbox: [number, number, number, number]): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
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

export class Tracker {
  private tracks: Map<string, TrackedObject> = new Map();

  /**
   * Update tracker with new detections.
   *
   * @param detections – current-frame detections (normalised coords)
   * @param now        – current timestamp in ms
   * @param pixelsPerMeter – calibration: how many pixels equal 1 m
   *                         (based on reference object; default 100)
   * @param videoWidth     – video frame width in pixels (for speed calc)
   *
   * @returns active tracks after update, plus IDs of newly counted objects
   */
  update(
    detections: Detection[],
    now: number,
    pixelsPerMeter: number,
    videoWidth: number,
    videoHeight: number,
  ): { tracks: TrackedObject[]; newlyCounted: TrackedObject[] } {
    const matched   = new Set<string>(); // track IDs matched this frame
    const usedDets  = new Set<number>();
    const newlyCounted: TrackedObject[] = [];

    // --- Match detections to existing tracks by IoU ---
    const trackArr = Array.from(this.tracks.values());
    for (const track of trackArr) {
      let bestIoU = IOU_MATCH;
      let bestDet = -1;
      detections.forEach((det, di) => {
        if (usedDets.has(di)) return;
        if (det.classId !== track.classId) return;
        const score = iou(det.bbox, track.bbox);
        if (score > bestIoU) { bestIoU = score; bestDet = di; }
      });

      if (bestDet >= 0) {
        const det = detections[bestDet];
        usedDets.add(bestDet);
        matched.add(track.id);
        const [cx, cy] = centroid(det.bbox);

        // Append centroid to history
        track.history.push({ cx, cy, ts: now });
        if (track.history.length > MAX_HISTORY) track.history.shift();

        // Update track state
        track.bbox       = det.bbox;
        track.centroid   = [cx, cy];
        track.confidence = det.confidence;
        track.missedFrames = 0;

        // Compute speed (need at least ~0.5 s of history)
        track.speedKph = computeSpeed(
          track.history,
          pixelsPerMeter,
          videoWidth,
          videoHeight,
        );
      } else {
        track.missedFrames++;
      }
    }

    // --- Create new tracks for unmatched detections ---
    detections.forEach((det, di) => {
      if (usedDets.has(di)) return;
      const [cx, cy] = centroid(det.bbox);
      const track: TrackedObject = {
        id:          `t${++trackIdCounter}`,
        classId:     det.classId,
        className:   det.className,
        confidence:  det.confidence,
        bbox:        det.bbox,
        centroid:    [cx, cy],
        history:     [{ cx, cy, ts: now }],
        speedKph:    null,
        missedFrames: 0,
        counted:     false,
      };
      this.tracks.set(track.id, track);
    });

    // --- Count new unique objects (first time track becomes stable) ---
    for (const track of this.tracks.values()) {
      if (!track.counted && track.history.length >= 3 && track.missedFrames === 0) {
        track.counted = true;
        newlyCounted.push(track);
      }
    }

    // --- Prune lost tracks ---
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

  getAllTracks(): TrackedObject[] {
    return Array.from(this.tracks.values());
  }
}

/**
 * Compute speed (km/h) from centroid history.
 * Uses the displacement over the most recent ~0.5-second window.
 *
 * @param history        – recent {cx, cy, ts} samples (normalised coords)
 * @param pixelsPerMeter – calibration: real pixels in original video per meter
 * @param videoWidth     – video width in pixels
 */
function computeSpeed(
  history: Array<{ cx: number; cy: number; ts: number }>,
  pixelsPerMeter: number,
  videoWidth: number,
  videoHeight: number,
): number | null {
  if (history.length < 4) return null;

  // Use window of 0.3–1.0 s back from the latest sample
  const latest = history[history.length - 1];
  let windowStart = -1;
  for (let i = history.length - 2; i >= 0; i--) {
    if (latest.ts - history[i].ts >= 300) { windowStart = i; break; }
  }
  if (windowStart < 0) return null;

  const old = history[windowStart];
  const dtSec = (latest.ts - old.ts) / 1000;
  if (dtSec <= 0) return null;

  // Displacement in normalised units → pixels (using correct per-axis scale) → metres → km/h
  const dxPx = (latest.cx - old.cx) * videoWidth;
  const dyPx = (latest.cy - old.cy) * videoHeight;
  const dPx  = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
  const dMeters = dPx / pixelsPerMeter;
  const speedMs = dMeters / dtSec;
  return speedMs * 3.6; // m/s → km/h
}
