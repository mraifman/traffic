/**
 * Singleton COCO-SSD model loader.
 * Uses the pure-JS CPU backend so no native bindings are needed.
 */
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { logger } from './logger';

let model: cocoSsd.ObjectDetection | null = null;
let loadError: Error | null = null;
let loadPromise: Promise<void> | null = null;

export function isModelReady(): boolean {
  return model !== null;
}

export async function loadModel(): Promise<void> {
  if (model) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    logger.info('Loading COCO-SSD model (CPU backend)…');
    await tf.setBackend('cpu');
    await tf.ready();
    model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    logger.info('COCO-SSD model ready.');
  })().catch((err) => {
    loadError = err;
    logger.error({ err }, 'Failed to load COCO-SSD model');
    loadPromise = null; // allow retry
  });

  return loadPromise;
}

export async function getModel(): Promise<cocoSsd.ObjectDetection> {
  if (loadError) throw loadError;
  if (!model) await loadModel();
  if (!model) throw new Error('Model unavailable');
  return model;
}
