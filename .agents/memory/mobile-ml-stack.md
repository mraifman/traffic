---
name: Mobile ML stack
description: Camera + inference package choices for the traffic-analyzer-mobile app; why VisionCamera was dropped.
---

## Current stack
- **Camera display + snapshot**: `expo-camera` (`CameraView` + `takePictureAsync`)
- **Inference**: `react-native-fast-tflite` v3 (Nitro modules) with CoreML delegate on iOS
- **Resize**: `expo-image-manipulator@~14.0.8`
- **JPEG decode**: `jpeg-js`
- **Peer dep**: `react-native-nitro-modules` (required by fast-tflite even when VisionCamera is absent)

## Why VisionCamera was removed
`react-native-vision-camera@5.x` (Nitro-based) crashes Metro Bundler on Replit because:
1. No `watchman` is installed → Metro falls back to `FallbackWatcher`
2. `FallbackWatcher` tries to create a temp file (`react-native-vision-camera_tmp_XXXX`) inside the pnpm virtual store path for VisionCamera
3. That path doesn't exist, crashing the watcher process entirely

**Why:** pnpm's virtual store uses deep symlinks that Metro's FallbackWatcher traverses; it then tries to create test files in those paths. Without watchman, this is unavoidable without a Metro watcher patch.

## Pipeline (per frame, ~4 fps)
`takePictureAsync(quality:0.35)` → `ImageManipulator.manipulateAsync(resize 320×320)` → `fetch(uri).arrayBuffer()` → `jpeg.decode(RGBA)` → `rgbaToModelInput(RGBA→RGB)` → `model.model.run([ArrayBuffer])` → `parseEfficientDet(outputs)` → `Tracker.update()`

## Build requirement
`react-native-fast-tflite` (Nitro) does NOT run in standard Expo Go. Requires EAS custom development build:
```
eas build --platform ios --profile development
```
Screen gracefully degrades: lazy `require()` in try/catch → shows "Development Build Required" UI when Nitro is absent.
