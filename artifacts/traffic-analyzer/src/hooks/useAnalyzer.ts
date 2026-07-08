/**
 * Main orchestrator hook for the traffic analyzer.
 * Manages video/camera input, TF.js COCO-SSD inference, tracking, and count accumulation.
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import { loadModel, detect } from '@/lib/detector';
import { Tracker, type TrackedObject } from '@/lib/tracker';
import type { ObjectDetection } from '@tensorflow-models/coco-ssd';

export type SourceType = 'camera' | 'file';

export interface Counts {
  cars: number;
  pedestrians: number;
  bikes: number;
  motorcycles: number;
  trucks: number;
  buses: number;
  total: number;
}

export interface SpeedStats {
  avg: number | null;
  max: number | null;
  current: number[]; // km/h of objects visible right now
}

export interface UseAnalyzerReturn {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isRunning: boolean;
  isModelLoading: boolean;
  modelLoadProgress: number;
  modelError: string | null;
  counts: Counts;
  speedStats: SpeedStats;
  fps: number;
  activeTracks: TrackedObject[];
  elapsedSeconds: number;
  pixelsPerMeter: number;
  setPixelsPerMeter: (v: number) => void;
  source: SourceType | null;
  startCamera: () => Promise<void>;
  startVideo: (file: File) => void;
  stop: () => void;
  reset: () => void;
}

const EMPTY_COUNTS: Counts = {
  cars: 0, pedestrians: 0, bikes: 0,
  motorcycles: 0, trucks: 0, buses: 0, total: 0,
};

const CLASS_COLORS: Record<string, string> = {
  person:     '#22c55e',
  bicycle:    '#f59e0b',
  car:        '#3b82f6',
  motorcycle: '#a855f7',
  bus:        '#ef4444',
  truck:      '#f97316',
};

function buildSpeedStats(tracks: TrackedObject[], prevMax: number | null): SpeedStats {
  const current = tracks
    .map((t) => t.speedKph)
    .filter((s): s is number => s !== null && s > 0 && s < 250);
  const avg = current.length
    ? Math.round(current.reduce((a, b) => a + b, 0) / current.length)
    : null;
  const frameMax = current.length ? Math.max(...current) : null;
  const max = frameMax !== null
    ? (prevMax !== null ? Math.max(prevMax, frameMax) : frameMax)
    : prevMax;
  return { avg, max, current };
}

export function useAnalyzer(): UseAnalyzerReturn {
  const videoRef  = useRef<HTMLVideoElement>(null!);
  const canvasRef = useRef<HTMLCanvasElement>(null!);
  const modelRef  = useRef<ObjectDetection | null>(null);
  const trackerRef = useRef(new Tracker());
  const rafRef    = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef   = useRef<number | null>(null);
  const frameCountRef  = useRef(0);
  const fpsTimerRef    = useRef(0);
  const countsRef      = useRef<Counts>({ ...EMPTY_COUNTS });
  const maxSpeedRef    = useRef<number | null>(null);
  const pixelsRef      = useRef(100);

  const [isRunning,        setIsRunning]        = useState(false);
  const [isModelLoading,   setIsModelLoading]   = useState(false);
  const [modelLoadProgress,setModelLoadProgress]= useState(0);
  const [modelError,       setModelError]       = useState<string | null>(null);
  const [counts,           setCounts]           = useState<Counts>({ ...EMPTY_COUNTS });
  const [speedStats,       setSpeedStats]       = useState<SpeedStats>({ avg: null, max: null, current: [] });
  const [fps,              setFps]              = useState(0);
  const [activeTracks,     setActiveTracks]     = useState<TrackedObject[]>([]);
  const [elapsedSeconds,   setElapsedSeconds]   = useState(0);
  const [pixelsPerMeter,   _setPixelsPerMeter]  = useState(100);
  const [source,           setSource]           = useState<SourceType | null>(null);

  const setPixelsPerMeter = useCallback((v: number) => {
    pixelsRef.current = v;
    _setPixelsPerMeter(v);
  }, []);

  const drawOverlay = useCallback(
    (canvas: HTMLCanvasElement, video: HTMLVideoElement, tracks: TrackedObject[]) => {
      const W = video.videoWidth;
      const H = video.videoHeight;
      if (!W || !H) return;
      canvas.width  = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, W, H);

      for (const t of tracks) {
        const [x1n, y1n, x2n, y2n] = t.bbox;
        const x1 = x1n * W, y1 = y1n * H;
        const bw = (x2n - x1n) * W, bh = (y2n - y1n) * H;

        const color = CLASS_COLORS[t.className] ?? '#ffffff';
        ctx.strokeStyle = color;
        ctx.lineWidth   = 2;
        ctx.strokeRect(x1, y1, bw, bh);

        const label = t.speedKph !== null
          ? `${t.className} ${Math.round(t.speedKph)} km/h`
          : t.className;
        ctx.font = 'bold 12px monospace';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = color;
        ctx.fillRect(x1, y1 - 18, tw + 8, 18);
        ctx.fillStyle = '#000';
        ctx.fillText(label, x1 + 4, y1 - 4);
      }
    },
    [],
  );

  const runLoop = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    const model  = modelRef.current;
    if (!video || !canvas || !model || video.paused || video.ended) {
      if (video?.ended) setIsRunning(false);
      return;
    }
    if (video.videoWidth === 0) {
      rafRef.current = requestAnimationFrame(runLoop);
      return;
    }

    const now = performance.now();
    frameCountRef.current++;
    if (now - fpsTimerRef.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      fpsTimerRef.current   = now;
    }
    if (startTimeRef.current !== null) {
      setElapsedSeconds(Math.floor((now - startTimeRef.current) / 1000));
    }

    detect(model, video)
      .then((detections) => {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const { tracks, newlyCounted } = trackerRef.current.update(
          detections, now, pixelsRef.current, vw, vh,
        );

        for (const t of newlyCounted) {
          const c = countsRef.current;
          if (t.classId === 2) c.cars++;
          if (t.classId === 0) c.pedestrians++;
          if (t.classId === 1) c.bikes++;
          if (t.classId === 3) c.motorcycles++;
          if (t.classId === 7) c.trucks++;
          if (t.classId === 5) c.buses++;
          c.total++;
          setCounts({ ...countsRef.current });
        }

        const stats = buildSpeedStats(tracks, maxSpeedRef.current);
        if (stats.max !== null) maxSpeedRef.current = stats.max;
        setSpeedStats(stats);
        setActiveTracks([...tracks]);
        drawOverlay(canvas, video, tracks);

        rafRef.current = requestAnimationFrame(runLoop);
      })
      .catch(() => {
        rafRef.current = requestAnimationFrame(runLoop);
      });
  }, [drawOverlay]);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startLoop = useCallback(() => {
    fpsTimerRef.current  = performance.now();
    startTimeRef.current = performance.now();
    setIsRunning(true);
    rafRef.current = requestAnimationFrame(runLoop);
  }, [runLoop]);

  const stop = useCallback(() => {
    stopLoop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) { video.pause(); video.srcObject = null; video.src = ''; }
    setIsRunning(false);
  }, [stopLoop]);

  const reset = useCallback(() => {
    stop();
    trackerRef.current.reset();
    countsRef.current  = { ...EMPTY_COUNTS };
    maxSpeedRef.current = null;
    setCounts({ ...EMPTY_COUNTS });
    setSpeedStats({ avg: null, max: null, current: [] });
    setActiveTracks([]);
    setElapsedSeconds(0);
    setFps(0);
    setSource(null);
    setModelError(null);
  }, [stop]);

  const ensureModel = useCallback(async () => {
    if (modelRef.current) return true;
    setIsModelLoading(true);
    setModelError(null);
    try {
      modelRef.current = await loadModel((pct) => setModelLoadProgress(pct));
      return true;
    } catch (err) {
      setModelError(`Failed to load model: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    } finally {
      setIsModelLoading(false);
    }
  }, []);

  const startCamera = useCallback(async () => {
    stop();
    const ok = await ensureModel();
    if (!ok) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      setSource('camera');
      trackerRef.current.reset();
      countsRef.current   = { ...EMPTY_COUNTS };
      maxSpeedRef.current = null;
      startLoop();
    } catch (err) {
      setModelError(`Camera error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [stop, ensureModel, startLoop]);

  const startVideo = useCallback(
    (file: File) => {
      stop();
      ensureModel().then((ok) => {
        if (!ok) return;
        const video = videoRef.current;
        const url   = URL.createObjectURL(file);
        video.src   = url;
        video.load();
        const onReady = () => {
          video.removeEventListener('loadeddata', onReady);
          video.play().then(() => {
            setSource('file');
            trackerRef.current.reset();
            countsRef.current   = { ...EMPTY_COUNTS };
            maxSpeedRef.current = null;
            startLoop();
          });
        };
        video.addEventListener('loadeddata', onReady);
      });
    },
    [stop, ensureModel, startLoop],
  );

  // Cleanup on unmount
  useEffect(() => () => { stop(); }, [stop]);

  return {
    videoRef, canvasRef,
    isRunning, isModelLoading, modelLoadProgress, modelError,
    counts, speedStats, fps, activeTracks,
    elapsedSeconds, pixelsPerMeter, setPixelsPerMeter,
    source, startCamera, startVideo, stop, reset,
  };
}
