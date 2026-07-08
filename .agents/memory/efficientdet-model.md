---
name: EfficientDet model mismatch
description: The model file is named yolo11n.tflite but is actually EfficientDet-Lite0; parser is locked to EfficientDet semantics.
---

## File
`artifacts/traffic-analyzer-mobile/assets/models/yolo11n.tflite`

## Reality
Despite the filename, this is **EfficientDet-Lite0** (`lite-model_efficientdet_lite0_detection_metadata_1.tflite`, 4.4 MB, `TFL3` magic bytes, downloaded from Google Storage).

## Output format (assumed/validated)
| Index | Tensor | Shape | Type |
|-------|--------|-------|------|
| 0 | detection_boxes | [1, 25, 4] float32 | [ymin, xmin, ymax, xmax] normalised |
| 1 | detection_classes | [1, 25] float32 | COCO class ID, 1-indexed |
| 2 | detection_scores | [1, 25] float32 | confidence 0..1 |
| 3 | num_detections | [1] float32 | count of valid dets |

COCO classes used: 1=person 2=bicycle 3=car 4=motorcycle 6=bus 8=truck

## Runtime guard
`parseEfficientDet()` in `lib/yoloDetect.ts` validates output count and minimum buffer sizes before parsing. Mismatches log a warning and return `[]` instead of producing garbage detections.

**Why:** If a future model swap uses YOLO format (different output semantics), the guard catches it immediately at runtime rather than silently counting wrong objects.

## Rename TODO
Rename `yolo11n.tflite` → `efficientdet_lite0.tflite` and update `require()` paths in `index.tsx` for clarity.
