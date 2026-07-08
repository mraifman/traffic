/**
 * EfficientDet-Lite0 TFLite output parser.
 *
 * Model: lite-model_efficientdet_lite0_detection_metadata_1.tflite
 * Input:  [1, 320, 320, 3]  UINT8 RGB
 * Outputs (post-NMS, up to 25 detections):
 *   [0] detection_boxes   Float32[1×25×4]  — [ymin, xmin, ymax, xmax] normalised 0..1
 *   [1] detection_classes Float32[1×25]    — COCO class index (1-indexed)
 *   [2] detection_scores  Float32[1×25]    — confidence 0..1
 *   [3] num_detections    Float32[1]       — number of valid detections
 *
 * COCO class IDs (1-indexed) that we care about:
 *   1=person  2=bicycle  3=car  4=motorcycle  6=bus  8=truck
 */

export interface DetectionResult {
  classId: number;       // 1-indexed COCO class
  className: string;
  score: number;
  /** Normalised [x1, y1, x2, y2] in [0..1] */
  bboxNorm: [number, number, number, number];
}

const TRAFFIC_CLASSES: Record<number, string> = {
  1: 'person',
  2: 'bicycle',
  3: 'car',
  4: 'motorcycle',
  6: 'bus',
  8: 'truck',
};

const CONF_THRESHOLD = 0.35;

export function parseEfficientDet(outputs: ArrayBuffer[]): DetectionResult[] {
  // Runtime shape guard — fail loudly on model/parser mismatch rather than
  // producing silent garbage detections.
  if (outputs.length < 4) {
    console.warn('[yoloDetect] Expected 4 output buffers, got', outputs.length);
    return [];
  }
  // Each EfficientDet-Lite0 output for up to 25 detections:
  //   boxes:   4 floats × 25  → 400 bytes
  //   classes: 1 float  × 25  → 100 bytes
  //   scores:  1 float  × 25  → 100 bytes
  //   numDet:  1 float  × 1   →   4 bytes
  const MIN_BYTES = [100, 100, 100, 4]; // bytes for ≥1 detection
  for (let i = 0; i < MIN_BYTES.length; i++) {
    if (outputs[i].byteLength < MIN_BYTES[i]) {
      console.warn('[yoloDetect] Output', i, 'is', outputs[i].byteLength, 'bytes — model/parser mismatch?');
      return [];
    }
  }

  const boxes      = new Float32Array(outputs[0]);   // [1,25,4]
  const classes    = new Float32Array(outputs[1]);   // [1,25]
  const scores     = new Float32Array(outputs[2]);   // [1,25]
  const numDet     = new Float32Array(outputs[3]);   // [1]

  const count = Math.min(Math.round(numDet[0]), classes.length);
  const results: DetectionResult[] = [];

  for (let i = 0; i < count; i++) {
    const score   = scores[i];
    if (score < CONF_THRESHOLD) continue;

    const classId = Math.round(classes[i]);   // 1-indexed
    const name    = TRAFFIC_CLASSES[classId];
    if (!name) continue;

    const ymin = boxes[i * 4 + 0];
    const xmin = boxes[i * 4 + 1];
    const ymax = boxes[i * 4 + 2];
    const xmax = boxes[i * 4 + 3];

    results.push({
      classId,
      className: name,
      score,
      bboxNorm: [
        Math.max(0, xmin),
        Math.max(0, ymin),
        Math.min(1, xmax),
        Math.min(1, ymax),
      ],
    });
  }

  return results;
}

// ─── Frame preprocessing ──────────────────────────────────────────────────────

export const MODEL_INPUT_W = 320;
export const MODEL_INPUT_H = 320;

/**
 * Convert RGBA Uint8Array (any dimensions) to a 320×320 RGB Uint8Array
 * via nearest-neighbour resampling — pure JS, no native deps.
 */
export function rgbaToModelInput(
  rgba: Uint8Array,
  srcW: number,
  srcH: number,
): Uint8Array {
  const out = new Uint8Array(MODEL_INPUT_W * MODEL_INPUT_H * 3);
  for (let y = 0; y < MODEL_INPUT_H; y++) {
    for (let x = 0; x < MODEL_INPUT_W; x++) {
      const sx = Math.floor((x / MODEL_INPUT_W) * srcW);
      const sy = Math.floor((y / MODEL_INPUT_H) * srcH);
      const si = (sy * srcW + sx) * 4;
      const di = (y * MODEL_INPUT_W + x) * 3;
      out[di]     = rgba[si];
      out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2];
    }
  }
  return out;
}
