/**
 * Object detector using TensorFlow.js + COCO-SSD (MobileNet V2).
 * Models are downloaded automatically from Google's CDN on first use.
 */
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';

// COCO class IDs / names we care about (using coco-ssd string labels)
export const TRACKED_CLASSES: Record<string, number> = {
  person:     0,
  bicycle:    1,
  car:        2,
  motorcycle: 3,
  bus:        5,
  truck:      7,
};

export const CLASS_COLORS: Record<string, string> = {
  person:     '#22c55e',   // green
  bicycle:    '#f59e0b',   // amber
  car:        '#3b82f6',   // blue
  motorcycle: '#a855f7',   // purple
  bus:        '#ef4444',   // red
  truck:      '#f97316',   // orange
};

export type TrackedClassName = keyof typeof TRACKED_CLASSES;

export interface Detection {
  id: string;
  classId: number;
  className: string;
  confidence: number;
  /** Normalised [0..1] coordinates: x1, y1, x2, y2 */
  bbox: [number, number, number, number];
}

let modelCache: cocoSsd.ObjectDetection | null = null;
let loadingPromise: Promise<cocoSsd.ObjectDetection> | null = null;
let detIdCounter = 0;

/** Load (or return cached) COCO-SSD model. */
export async function loadModel(
  onProgress?: (pct: number) => void,
): Promise<cocoSsd.ObjectDetection> {
  if (modelCache) { onProgress?.(100); return modelCache; }
  if (loadingPromise) { onProgress?.(50); return loadingPromise; }

  onProgress?.(5);
  loadingPromise = cocoSsd.load({ base: 'mobilenet_v2' }).then((m) => {
    onProgress?.(100);
    modelCache = m;
    loadingPromise = null;
    return m;
  });
  return loadingPromise;
}

/**
 * Run detection on one video frame.
 * Returns detections in normalised [0..1] coordinates.
 */
export async function detect(
  model: cocoSsd.ObjectDetection,
  source: HTMLVideoElement | HTMLCanvasElement,
): Promise<Detection[]> {
  const w = source instanceof HTMLVideoElement ? source.videoWidth  : source.width;
  const h = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (!w || !h) return [];

  const predictions = await model.detect(source, 20, 0.3);

  return predictions
    .filter((p) => p.class in TRACKED_CLASSES)
    .map((p) => {
      const [bx, by, bw, bh] = p.bbox;
      const x1 = Math.max(0, bx / w);
      const y1 = Math.max(0, by / h);
      const x2 = Math.min(1, (bx + bw) / w);
      const y2 = Math.min(1, (by + bh) / h);
      return {
        id:         `d${++detIdCounter}`,
        classId:    TRACKED_CLASSES[p.class],
        className:  p.class,
        confidence: p.score,
        bbox:       [x1, y1, x2, y2] as [number, number, number, number],
      };
    });
}
