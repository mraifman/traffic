#!/usr/bin/env node
/**
 * Downloads the YOLO11n TFLite model for on-device traffic detection.
 * Run once before building: node scripts/download-model.js
 */
const https = require('https');
const fs   = require('fs');
const path = require('path');

const DEST = path.join(__dirname, '..', 'assets', 'models', 'yolo11n.tflite');
const URLS = [
  // EfficientDet-Lite0 (reliable, Google Storage) — different model, update postprocessing if used
  'https://storage.googleapis.com/download.tensorflow.org/models/tflite/task_library/object_detection/android/lite-model_efficientdet_lite0_detection_metadata_1.tflite',
  // YOLOv8n from Hugging Face
  'https://huggingface.co/Ultralytics/Assets/resolve/main/yolov8n.tflite',
  // YOLO11n from Ultralytics
  'https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.tflite',
];

function download(url, dest, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 15) { reject(new Error('Too many redirects')); return; }
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'curl/7.88', Accept: 'application/octet-stream' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        resolve(download(res.headers.location, dest, depth + 1));
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(dest); } catch {}
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        // Sanity check: real TFLite files are at least 100 KB
        const size = fs.statSync(dest).size;
        if (size < 102400) {
          fs.unlinkSync(dest);
          reject(new Error(`File too small (${size} bytes) — probably an error page`));
        } else {
          resolve(size);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  for (const url of URLS) {
    process.stdout.write(`Trying ${url.substring(0, 70)}… `);
    try {
      const size = await download(url, DEST);
      console.log(`✓ ${(size / 1024 / 1024).toFixed(1)} MB`);
      return;
    } catch (e) {
      console.log(`✗ ${e.message}`);
    }
  }
  console.error('\n❌ All sources failed. Download the model manually:');
  console.error('  1. Visit https://docs.ultralytics.com/models/yolo11/#performance-metrics');
  console.error('  2. Download yolo11n.tflite');
  console.error(`  3. Place it at: ${DEST}`);
  process.exit(1);
}

main();
