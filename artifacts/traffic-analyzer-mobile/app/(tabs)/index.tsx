/**
 * Counter screen — automatic vehicle detection via server-side COCO-SSD.
 *
 * Flow:
 *   1. expo-camera captures a low-res JPEG frame every ~300 ms
 *   2. expo-image-manipulator resizes it to 320 px wide
 *   3. The frame is sent to POST /api/detect (Express + COCO-SSD)
 *   4. The IoU tracker (lib/tracker.ts) assigns stable IDs across frames
 *   5. Bounding boxes + speed labels are drawn over the live camera preview
 *   6. Class counts and avg/max speed update in the HUD
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Modal, TextInput, ScrollView, Platform,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import colors from '@/constants/colors';
import { Tracker, type TrackedObject } from '@/lib/tracker';
import { useCreateSession, getListSessionsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

// ─── constants ────────────────────────────────────────────────────────────────

type VehicleKey = 'cars' | 'pedestrians' | 'bikes' | 'motorcycles' | 'trucks' | 'buses';
type Counts = Record<VehicleKey, number>;

const CLASS_MAP: Record<string, { key: VehicleKey; color: string; icon: string }> = {
  car:        { key: 'cars',         color: colors.vehicles.cars,         icon: 'car' },
  person:     { key: 'pedestrians',  color: colors.vehicles.pedestrians,  icon: 'walk' },
  bicycle:    { key: 'bikes',        color: colors.vehicles.bikes,        icon: 'bicycle' },
  motorcycle: { key: 'motorcycles',  color: colors.vehicles.motorcycles,  icon: 'motorbike' },
  bus:        { key: 'buses',        color: colors.vehicles.buses,        icon: 'bus' },
  truck:      { key: 'trucks',       color: colors.vehicles.trucks,       icon: 'truck' },
};

const DEFAULT_COUNTS: Counts = {
  cars: 0, pedestrians: 0, bikes: 0, motorcycles: 0, trucks: 0, buses: 0,
};

const CAPTURE_W = 320; // resize before sending to server
const BOTTOM_EXTRA = Platform.select({ ios: 50, web: 34, default: 12 })!;

// ─── helpers ──────────────────────────────────────────────────────────────────

function pad(n: number) { return n.toString().padStart(2, '0'); }
function formatElapsed(sec: number) { return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`; }
function formatDate(d: Date) {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function round1(n: number) { return Math.round(n * 10) / 10; }

// ─── BoundingBoxOverlay ────────────────────────────────────────────────────────

function BoundingBoxOverlay({
  tracks,
  viewWidth,
  viewHeight,
}: {
  tracks: TrackedObject[];
  viewWidth: number;
  viewHeight: number;
}) {
  if (viewWidth === 0 || viewHeight === 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {tracks.map((t) => {
        const meta = CLASS_MAP[t.className];
        if (!meta) return null;
        const [x1, y1, x2, y2] = t.bbox;
        const left   = x1 * viewWidth;
        const top    = y1 * viewHeight;
        const width  = (x2 - x1) * viewWidth;
        const height = (y2 - y1) * viewHeight;
        const color  = meta.color;
        const speed  = t.speedKph != null ? ` ${Math.round(t.speedKph)}km/h` : '';
        return (
          <View key={t.id} style={[styles.bbox, { left, top, width, height, borderColor: color }]}>
            <View style={[styles.bboxTag, { backgroundColor: color }]}>
              <Text style={styles.bboxTagText} numberOfLines={1}>
                {t.className}{speed}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── CountChip ────────────────────────────────────────────────────────────────

function CountChip({ label, icon, count, color }: { label: string; icon: string; count: number; color: string }) {
  return (
    <View style={[styles.chip, { borderColor: color + '55', backgroundColor: color + '14' }]}>
      <MaterialCommunityIcons name={icon as any} size={13} color={color} />
      <Text style={[styles.chipCount, { color }]}>{count}</Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CounterScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const queryClient = useQueryClient();
  const createSession = useCreateSession();

  // Camera
  const cameraRef = useRef<CameraView>(null);
  const [cameraSize, setCameraSize] = useState({ w: Dimensions.get('window').width, h: Dimensions.get('window').height });

  // Detection loop
  const isRunningRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);
  const trackerRef = useRef(new Tracker());
  const [tracks, setTracks] = useState<TrackedObject[]>([]);
  const [modelReady, setModelReady] = useState<boolean | null>(null); // null = unknown

  // Speed calibration
  const [pixelsPerMeter, setPixelsPerMeter] = useState(100);

  // Counts + timing
  const [counts, setCounts] = useState<Counts>({ ...DEFAULT_COUNTS });
  const [elapsed, setElapsed] = useState(0);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTime = useRef(0);

  // Derived speed stats
  const allSpeeds = useRef<number[]>([]);
  const [avgSpeed, setAvgSpeed] = useState<number | null>(null);
  const [maxSpeed, setMaxSpeed] = useState<number | null>(null);

  // Save modal
  const [showSave, setShowSave] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [sessionLocation, setSessionLocation] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  // ── server health check ────────────────────────────────────────────────────
  useEffect(() => {
    const base = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
    fetch(`${base}/api/healthz`)
      .then((r) => r.ok ? fetch(`${base}/api/detect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: '' }) }) : Promise.reject())
      .then((r) => setModelReady(r.status !== 503))
      .catch(() => setModelReady(false));
  }, []);

  // ── timer ─────────────────────────────────────────────────────────────────
  const startTimer = () => {
    startTime.current = Date.now() - elapsed * 1000;
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000));
    }, 500);
  };
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // ── detection loop ─────────────────────────────────────────────────────────
  const detectLoop = useCallback(async () => {
    if (!isRunningRef.current) return;

    try {
      if (!cameraRef.current) { setTimeout(detectLoop, 300); return; }

      // 1. Capture frame
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: false,
        skipProcessing: true,
      });

      if (!photo?.uri || !isRunningRef.current) { setTimeout(detectLoop, 100); return; }

      // 2. Resize to keep payload small
      const resized = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: CAPTURE_W } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );

      if (!resized.base64 || !isRunningRef.current) { setTimeout(detectLoop, 100); return; }

      // 3. Send to server
      const base = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
      const resp = await fetch(`${base}/api/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: resized.base64 }),
      });

      if (!isRunningRef.current) return;

      if (resp.status === 503) {
        setModelReady(false);
        setTimeout(detectLoop, 2000);
        return;
      }
      setModelReady(true);

      if (resp.ok) {
        const { detections } = await resp.json();

        // 4. Run tracker
        const now = Date.now();
        const frameW = resized.width ?? CAPTURE_W;
        const frameH = resized.height ?? Math.round(CAPTURE_W * (cameraSize.h / cameraSize.w));
        const { tracks: newTracks, newlyCounted } = trackerRef.current.update(
          detections,
          now,
          pixelsPerMeter,
          frameW,
          frameH,
        );

        setTracks(newTracks);

        // 5. Update counts for newly confirmed objects
        if (newlyCounted.length > 0) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setCounts((prev) => {
            const next = { ...prev };
            for (const obj of newlyCounted) {
              const meta = CLASS_MAP[obj.className];
              if (meta) next[meta.key]++;
            }
            return next;
          });
        }

        // 6. Update speed stats from all active tracks
        const speeds = newTracks
          .map((t) => t.speedKph)
          .filter((s): s is number => s !== null && s > 1);
        if (speeds.length > 0) {
          allSpeeds.current.push(...speeds);
          const all = allSpeeds.current;
          setAvgSpeed(round1(all.reduce((a, b) => a + b, 0) / all.length));
          setMaxSpeed(round1(Math.max(...all)));
        }
      }
    } catch {
      // Ignore transient errors (camera busy, network blip)
    }

    if (isRunningRef.current) setTimeout(detectLoop, 50);
  }, [pixelsPerMeter, cameraSize]);

  // ── start / stop ──────────────────────────────────────────────────────────
  const handleStart = () => {
    isRunningRef.current = true;
    setIsRunning(true);
    startTimer();
    setTimeout(detectLoop, 200);
  };

  const handleStop = () => {
    isRunningRef.current = false;
    setIsRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setTracks([]);
  };

  const handleReset = () => {
    handleStop();
    setCounts({ ...DEFAULT_COUNTS });
    setElapsed(0);
    allSpeeds.current = [];
    setAvgSpeed(null);
    setMaxSpeed(null);
    trackerRef.current.reset();
  };

  // ── save ──────────────────────────────────────────────────────────────────
  const handleSaveOpen = () => {
    handleStop();
    setSessionName(`Session ${formatDate(new Date())}`);
    setShowSave(true);
  };

  const handleSaveSubmit = () => {
    createSession.mutate(
      {
        data: {
          name: sessionName.trim() || `Session ${formatDate(new Date())}`,
          source: 'camera',
          totalCars: counts.cars,
          totalPedestrians: counts.pedestrians,
          totalBikes: counts.bikes,
          totalMotorcycles: counts.motorcycles,
          totalTrucks: counts.trucks,
          totalBuses: counts.buses,
          durationSeconds: elapsed,
          avgSpeedKph: avgSpeed,
          maxSpeedKph: maxSpeed,
          location: sessionLocation.trim() || undefined,
          notes: sessionNotes.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          setShowSave(false);
          handleReset();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      },
    );
  };

  // ── permission gates ──────────────────────────────────────────────────────
  if (!permission) {
    return <View style={[styles.center, { backgroundColor: c.background }]}><ActivityIndicator color={c.primary} /></View>;
  }
  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: c.background, paddingTop: insets.top + 20 }]}>
        <Ionicons name="camera-outline" size={56} color={c.mutedForeground} />
        <Text style={[styles.permTitle, { color: c.foreground }]}>Camera Access</Text>
        <Text style={[styles.permDesc, { color: c.mutedForeground }]}>
          The app uses your camera to detect and track vehicles automatically.
        </Text>
        <TouchableOpacity style={[styles.permBtn, { backgroundColor: c.primary }]} onPress={requestPermission}>
          <Text style={[styles.permBtnText, { color: c.primaryForeground }]}>Allow Camera</Text>
        </TouchableOpacity>
        {Platform.OS !== 'web' && !permission.canAskAgain && (
          <Text style={[styles.permHint, { color: c.mutedForeground }]}>Enable camera in Settings to continue.</Text>
        )}
      </View>
    );
  }

  // ── main UI ───────────────────────────────────────────────────────────────
  return (
    <View
      style={[styles.container, { backgroundColor: c.background }]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setCameraSize({ w: width, h: height });
      }}
    >
      {/* Camera preview */}
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      {/* Dark scrim */}
      <View style={styles.scrim} />

      {/* Bounding box overlay */}
      <BoundingBoxOverlay tracks={tracks} viewWidth={cameraSize.w} viewHeight={cameraSize.h} />

      {/* ── HUD ─────────────────────────────────────────────────────────── */}
      <View style={[styles.hud, {
        paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 12),
        backgroundColor: c.background + 'dd',
        borderBottomColor: c.border,
      }]}>
        {/* Row 1: total | status | time */}
        <View style={styles.hudRow}>
          <View style={styles.hudStat}>
            <Text style={[styles.hudLabel, { color: c.mutedForeground }]}>TOTAL</Text>
            <Text style={[styles.hudValue, { color: c.foreground }]}>{total}</Text>
          </View>

          <View style={[styles.statusPill, {
            backgroundColor: isRunning ? '#22c55e22' : c.secondary,
            borderColor: isRunning ? '#22c55e66' : c.border,
          }]}>
            <View style={[styles.statusDot, { backgroundColor: isRunning ? '#22c55e' : c.mutedForeground }]} />
            <Text style={[styles.statusText, { color: isRunning ? '#22c55e' : c.mutedForeground }]}>
              {isRunning ? 'LIVE' : 'READY'}
            </Text>
          </View>

          <View style={styles.hudStat}>
            <Text style={[styles.hudLabel, { color: c.mutedForeground }]}>TIME</Text>
            <Text style={[styles.hudValueMono, { color: c.foreground }]}>{formatElapsed(elapsed)}</Text>
          </View>
        </View>

        {/* Row 2: speed stats */}
        <View style={[styles.speedRow, { borderTopColor: c.border + '55' }]}>
          <View style={styles.speedStat}>
            <Text style={[styles.hudLabel, { color: c.mutedForeground }]}>AVG SPEED</Text>
            <Text style={[styles.speedVal, { color: c.foreground }]}>
              {avgSpeed !== null ? avgSpeed : '--'}
              <Text style={[styles.speedUnit, { color: c.mutedForeground }]}> km/h</Text>
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <View style={styles.speedStat}>
            <Text style={[styles.hudLabel, { color: c.mutedForeground }]}>MAX SPEED</Text>
            <Text style={[styles.speedVal, { color: maxSpeed !== null ? c.primary : c.foreground }]}>
              {maxSpeed !== null ? maxSpeed : '--'}
              <Text style={[styles.speedUnit, { color: c.mutedForeground }]}> km/h</Text>
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <View style={styles.speedStat}>
            <Text style={[styles.hudLabel, { color: c.mutedForeground }]}>TRACKED</Text>
            <Text style={[styles.speedVal, { color: c.foreground }]}>{tracks.length}</Text>
          </View>
        </View>

        {/* Row 3: per-class count chips */}
        <View style={[styles.chipsRow, { borderTopColor: c.border + '44' }]}>
          {(Object.entries(CLASS_MAP) as [string, { key: VehicleKey; color: string; icon: string }][])
            .map(([cls, meta]) => (
              <CountChip
                key={cls}
                label={cls}
                icon={meta.icon}
                count={counts[meta.key]}
                color={meta.color}
              />
            ))}
        </View>
      </View>

      {/* ── Model not ready banner ────────────────────────────────────────── */}
      {modelReady === false && (
        <View style={[styles.banner, { backgroundColor: '#f59e0b22', borderColor: '#f59e0b55' }]}>
          <Ionicons name="cloud-offline-outline" size={16} color="#f59e0b" />
          <Text style={[styles.bannerText, { color: '#f59e0b' }]}>
            Model loading on server — detection will start shortly
          </Text>
        </View>
      )}

      {/* ── Calibration strip ────────────────────────────────────────────── */}
      {!isRunning && (
        <View style={[styles.calibStrip, { backgroundColor: c.background + 'dd', borderColor: c.border }]}>
          <MaterialCommunityIcons name="ruler" size={13} color={c.mutedForeground} />
          <Text style={[styles.calibLabel, { color: c.mutedForeground }]}>Pixels/m:</Text>
          <TouchableOpacity
            style={[styles.calibBtn, { backgroundColor: c.secondary }]}
            onPress={() => setPixelsPerMeter((p) => Math.max(10, p - 10))}
          >
            <Ionicons name="remove" size={13} color={c.foreground} />
          </TouchableOpacity>
          <Text style={[styles.calibValue, { color: c.foreground }]}>{pixelsPerMeter}</Text>
          <TouchableOpacity
            style={[styles.calibBtn, { backgroundColor: c.secondary }]}
            onPress={() => setPixelsPerMeter((p) => Math.min(500, p + 10))}
          >
            <Ionicons name="add" size={13} color={c.foreground} />
          </TouchableOpacity>
          <Text style={[styles.calibHint, { color: c.mutedForeground }]}>
            (pixels spanning 1 m in frame)
          </Text>
        </View>
      )}

      {/* ── Bottom controls ───────────────────────────────────────────────── */}
      <View style={[styles.controls, {
        paddingBottom: insets.bottom + BOTTOM_EXTRA,
        backgroundColor: c.background + 'f0',
        borderTopColor: c.border,
      }]}>
        {!isRunning ? (
          <View style={styles.controlRow}>
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: c.secondary, borderColor: c.border }]}
              onPress={handleReset}
              testID="btn-reset"
            >
              <Ionicons name="refresh" size={20} color={c.foreground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: c.primary }]}
              onPress={handleStart}
              testID="btn-start"
            >
              <Ionicons name="play" size={20} color={c.primaryForeground} />
              <Text style={[styles.btnLabel, { color: c.primaryForeground }]}>Detect</Text>
            </TouchableOpacity>
            {total > 0 && (
              <TouchableOpacity
                style={[styles.iconBtn, { backgroundColor: '#22c55e22', borderColor: '#22c55e55' }]}
                onPress={handleSaveOpen}
                testID="btn-save"
              >
                <Ionicons name="save-outline" size={20} color="#22c55e" />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.controlRow}>
            <TouchableOpacity
              style={[styles.stopBtn, { backgroundColor: '#ef444422', borderColor: '#ef444455' }]}
              onPress={handleStop}
              testID="btn-stop"
            >
              <Ionicons name="stop" size={20} color="#ef4444" />
              <Text style={[styles.btnLabel, { color: '#ef4444' }]}>Stop</Text>
            </TouchableOpacity>
            {total > 0 && (
              <TouchableOpacity
                style={[styles.iconBtn, { backgroundColor: '#22c55e22', borderColor: '#22c55e55' }]}
                onPress={handleSaveOpen}
                testID="btn-stop-save"
              >
                <Ionicons name="save-outline" size={20} color="#22c55e" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* ── Save modal ────────────────────────────────────────────────────── */}
      <Modal visible={showSave} animationType="slide" presentationStyle="formSheet">
        <View style={[styles.modal, { backgroundColor: c.background }]}>
          <View style={[styles.modalHeader, {
            borderBottomColor: c.border,
            paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16),
          }]}>
            <TouchableOpacity onPress={() => setShowSave(false)} testID="btn-cancel-save">
              <Ionicons name="close" size={24} color={c.mutedForeground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: c.foreground }]}>Save Session</Text>
            <TouchableOpacity onPress={handleSaveSubmit} disabled={createSession.isPending} testID="btn-confirm-save">
              {createSession.isPending
                ? <ActivityIndicator size="small" color={c.primary} />
                : <Text style={[styles.modalSave, { color: c.primary }]}>Save</Text>}
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            {/* Count breakdown */}
            <View style={[styles.summaryRow, { backgroundColor: c.card, borderColor: c.border }]}>
              {(Object.entries(CLASS_MAP) as [string, { key: VehicleKey; color: string; icon: string }][])
                .map(([cls, meta]) => (
                  <View key={cls} style={styles.summaryItem}>
                    <MaterialCommunityIcons name={meta.icon as any} size={16} color={meta.color} />
                    <Text style={[styles.summaryCount, { color: c.foreground }]}>{counts[meta.key]}</Text>
                  </View>
                ))}
            </View>
            {/* Speed summary */}
            <View style={[styles.speedSummaryRow, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={styles.speedSummaryItem}>
                <Text style={[styles.hudLabel, { color: c.mutedForeground }]}>AVG</Text>
                <Text style={[styles.speedVal, { color: c.foreground }]}>{avgSpeed !== null ? `${avgSpeed} km/h` : '--'}</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: c.border }]} />
              <View style={styles.speedSummaryItem}>
                <Text style={[styles.hudLabel, { color: c.mutedForeground }]}>MAX</Text>
                <Text style={[styles.speedVal, { color: maxSpeed !== null ? c.primary : c.foreground }]}>{maxSpeed !== null ? `${maxSpeed} km/h` : '--'}</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: c.border }]} />
              <View style={styles.speedSummaryItem}>
                <Text style={[styles.hudLabel, { color: c.mutedForeground }]}>DURATION</Text>
                <Text style={[styles.speedVal, { color: c.foreground }]}>{formatElapsed(elapsed)}</Text>
              </View>
            </View>

            <Text style={[styles.fieldLabel, { color: c.mutedForeground }]}>Session Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: c.card, borderColor: c.border, color: c.foreground }]}
              value={sessionName}
              onChangeText={setSessionName}
              placeholderTextColor={c.mutedForeground}
              testID="input-name"
            />
            <Text style={[styles.fieldLabel, { color: c.mutedForeground }]}>Location (optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: c.card, borderColor: c.border, color: c.foreground }]}
              value={sessionLocation}
              onChangeText={setSessionLocation}
              placeholder="e.g. Main St & 4th Ave"
              placeholderTextColor={c.mutedForeground}
              testID="input-location"
            />
            <Text style={[styles.fieldLabel, { color: c.mutedForeground }]}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputMulti, { backgroundColor: c.card, borderColor: c.border, color: c.foreground }]}
              value={sessionNotes}
              onChangeText={setSessionNotes}
              placeholder="Weather, visibility, other observations…"
              placeholderTextColor={c.mutedForeground}
              multiline
              testID="input-notes"
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,13,26,0.45)' },

  // Permission
  permTitle: { fontSize: 22, fontWeight: '700', marginTop: 16 },
  permDesc: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginTop: 8 },
  permBtn: { marginTop: 24, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 10 },
  permBtnText: { fontSize: 15, fontWeight: '700' },
  permHint: { fontSize: 12, marginTop: 12, textAlign: 'center' },

  // HUD
  hud: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1 },
  hudRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 },
  hudStat: { alignItems: 'center', minWidth: 60 },
  hudLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 1 },
  hudValue: { fontSize: 30, fontWeight: '800' },
  hudValueMono: { fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  speedRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  speedStat: { flex: 1, alignItems: 'center' },
  speedVal: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  speedUnit: { fontSize: 10, fontWeight: '500' },
  divider: { width: StyleSheet.hairlineWidth, height: 26, marginHorizontal: 4 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  chipCount: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },

  // Bounding boxes
  bbox: { position: 'absolute', borderWidth: 2, borderRadius: 3 },
  bboxTag: { position: 'absolute', top: -18, left: 0, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },
  bboxTagText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  // Banner
  banner: { marginHorizontal: 16, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, borderWidth: 1 },
  bannerText: { fontSize: 12, flex: 1, fontWeight: '500' },

  // Calibration
  calibStrip: {
    marginHorizontal: 16, marginTop: 6,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderRadius: 8,
  },
  calibLabel: { fontSize: 11, fontWeight: '600' },
  calibBtn: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  calibValue: { fontSize: 13, fontWeight: '700', minWidth: 36, textAlign: 'center', fontVariant: ['tabular-nums'] },
  calibHint: { fontSize: 10, flex: 1 },

  // Controls
  controls: { paddingHorizontal: 20, paddingTop: 10, borderTopWidth: 1 },
  controlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  iconBtn: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 25 },
  stopBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 36, paddingVertical: 14, borderRadius: 25, borderWidth: 1 },
  btnLabel: { fontSize: 15, fontWeight: '700' },

  // Modal
  modal: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalSave: { fontSize: 17, fontWeight: '700' },
  modalBody: { flex: 1, padding: 20 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 10, borderWidth: 1, marginBottom: 2 },
  summaryItem: { alignItems: 'center', gap: 4 },
  summaryCount: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  speedSummaryRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 20 },
  speedSummaryItem: { flex: 1, alignItems: 'center', gap: 3 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6, marginTop: 16 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 15 },
  inputMulti: { height: 80, textAlignVertical: 'top' },
});
