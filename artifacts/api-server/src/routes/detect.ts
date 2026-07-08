/**
 * POST /api/detect
 * Accepts a base64-encoded JPEG camera frame, runs COCO-SSD, and returns
 * normalised bounding boxes for traffic-relevant object classes.
 */
import { Router } from 'express';
import * as tf from '@tensorflow/tfjs';
import jpegJs from 'jpeg-js';
import { getModel, isModelReady } from '../lib/model';

// COCO class names → our canonical class info
const TRAFFIC_CLASSES: Record<string, { classId: number; className: string }> = {
  person:     { classId: 0, className: 'person' },
  bicycle:    { classId: 1, className: 'bicycle' },
  car:        { classId: 2, className: 'car' },
  motorcycle: { classId: 3, className: 'motorcycle' },
  bus:        { classId: 5, className: 'bus' },
  truck:      { classId: 7, className: 'truck' },
};

const DEFAULT_THRESHOLD = 0.35;

const router = Router();

router.post('/', async (req, res) => {
  if (!isModelReady()) {
    res.status(503).json({ error: 'Model loading, please retry in a moment.' });
    return;
  }

  const { image, threshold = DEFAULT_THRESHOLD } = req.body as {
    image: string;
    threshold?: number;
  };

  if (!image || typeof image !== 'string') {
    res.status(400).json({ error: 'image (base64 string) required' });
    return;
  }

  try {
    const model = await getModel();

    // Decode JPEG → raw pixels
    const buf = Buffer.from(image, 'base64');
    const { data: rgba, width, height } = jpegJs.decode(buf, { useTArray: true });

    // RGBA → RGB tensor
    const rgb = new Uint8Array(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      rgb[i * 3]     = rgba[i * 4];
      rgb[i * 3 + 1] = rgba[i * 4 + 1];
      rgb[i * 3 + 2] = rgba[i * 4 + 2];
    }

    const tensor = tf.tensor3d(rgb, [height, width, 3]);
    const predictions = await model.detect(tensor, 20, threshold);
    tensor.dispose();

    const detections = predictions
      .filter((p) => TRAFFIC_CLASSES[p.class])
      .map((p) => {
        const { classId, className } = TRAFFIC_CLASSES[p.class];
        const [x, y, w, h] = p.bbox;
        return {
          classId,
          className,
          score: p.score,
          // Normalised [x1,y1,x2,y2] in [0..1]
          bboxNorm: [
            Math.max(0, x / width),
            Math.max(0, y / height),
            Math.min(1, (x + w) / width),
            Math.min(1, (y + h) / height),
          ] as [number, number, number, number],
        };
      });

    res.json({ detections });
  } catch (err) {
    res.status(500).json({ error: 'Detection failed' });
  }
});

export default router;
