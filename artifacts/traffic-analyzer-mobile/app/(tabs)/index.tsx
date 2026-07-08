/**
 * Counter screen — expo-camera (display) + react-native-fast-tflite (CoreML inference)
 *
 * Detection pipeline per frame (~5 fps):
 *   takePictureAsync → expo-image-manipulator (resize 320×320)
 *   → fetch + arrayBuffer → jpeg-js decode → rgbaToModelInput
 *   → fast-tflite model.run() → parseEfficientDet → Tracker.update()
 *
 * ─── Build note ──────────────────────────────────────────────────────────────
 * react-native-fast-tflite requires a custom development build (EAS).
 * Standard Expo Go does not support Nitro native modules.
 * When running in Expo Go this screen shows build instructions.
 *
 *   npm install -g eas-cli
 *   eas login
 *   eas build --platform ios --profile development   (~15 min, needs Apple Dev account)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, {
  useState, useRef, useEffect, useCallback, useMemo,
} from 'react';
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
import { parseEfficientDet, rgbaToModelInput } from '@/lib/yoloDetect';
import { useCreateSession, getListSessionsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

// ─── Lazy-load fast-tflite — crashes if Nitro native module is absent ─────────
let useTensorflowModel: any = null;
let jpeg: any = null;
let nativeAvailable = false;
try {
  useTensorflowModel = require('react-native-fast-tflite').useTensorflowModel;
  jpeg = require('jpeg-js');
  nativeAvailable = true;
} catch {
  /* standard Expo Go — show build instructions */
}

// ─── constants ────────────────────────────────────────────────────────────────

type VKey = 'cars' | 'pedestrians' | 'bikes' | 'motorcycles' | 'trucks' | 'buses';
type Counts = Record<VKey, number>;

const CLASS_META: Record<string, { key: VKey; color: string; icon: string }> = {
  car:        { key: 'cars',        color: colors.vehicles.cars,        icon: 'car' },
  person:     { key: 'pedestrians', color: colors.vehicles.pedestrians, icon: 'walk' },
  bicycle:    { key: 'bikes',       color: colors.vehicles.bikes,       icon: 'bicycle' },
  motorcycle: { key: 'motorcycles', color: colors.vehicles.motorcycles, icon: 'motorbike' },
  bus:        { key: 'buses',       color: colors.vehicles.buses,       icon: 'bus' },
  truck:      { key: 'trucks',      color: colors.vehicles.trucks,      icon: 'truck' },
};
const DEFAULT_COUNTS: Counts = { cars: 0, pedestrians: 0, bikes: 0, motorcycles: 0, trucks: 0, buses: 0 };
const BOTTOM_EXTRA = Platform.select({ ios: 50, web: 34, default: 12 })!;
const FRAME_INTERVAL_MS = 250; // ~4 fps; CoreML inference runs in ~10–30 ms

// ─── helpers ──────────────────────────────────────────────────────────────────
const pad = (n: number) => n.toString().padStart(2, '0');
const fmtTime = (s: number) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
const fmtDate = (d: Date) => d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const r1 = (n: number) => Math.round(n * 10) / 10;

// ─── BBoxOverlay ──────────────────────────────────────────────────────────────
function BBoxOverlay({ tracks, w, h }: { tracks: TrackedObject[]; w: number; h: number }) {
  if (!w || !h) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {tracks.map((t) => {
        const m = CLASS_META[t.className];
        if (!m) return null;
        const [x1, y1, x2, y2] = t.bbox;
        return (
          <View key={t.id} style={[s.bbox, { left: x1 * w, top: y1 * h, width: (x2 - x1) * w, height: (y2 - y1) * h, borderColor: m.color }]}>
            <View style={[s.bboxTag, { backgroundColor: m.color }]}>
              <Text style={s.bboxTxt} numberOfLines={1}>
                {t.className}{t.speedKph != null ? ` ${Math.round(t.speedKph)} km/h` : ''}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────
function Chip({ icon, count, color }: { icon: string; count: number; color: string }) {
  return (
    <View style={[s.chip, { borderColor: color + '55', backgroundColor: color + '14' }]}>
      <MaterialCommunityIcons name={icon as any} size={13} color={color} />
      <Text style={[s.chipN, { color }]}>{count}</Text>
    </View>
  );
}

// ─── "Build required" gate ────────────────────────────────────────────────────
function BuildRequired({ c }: { c: ReturnType<typeof useColors> }) {
  return (
    <View style={[s.center, { backgroundColor: c.background, paddingHorizontal: 28 }]}>
      <MaterialCommunityIcons name="hammer-wrench" size={56} color={c.mutedForeground} />
      <Text style={[s.gTitle, { color: c.foreground }]}>Development Build Required</Text>
      <Text style={[s.gBody, { color: c.mutedForeground }]}>
        On-device ML detection uses EfficientDet-Lite0 running via CoreML.{'\n'}
        This requires a custom development build — it doesn't run in standard Expo Go.
      </Text>
      <View style={[s.gCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[s.gCode, { color: c.foreground }]}>
          {'npm install -g eas-cli\n'}
          {'eas login\n'}
          {'eas build --platform ios --profile development\n'}
          {'# Install on device from EAS dashboard → done'}
        </Text>
      </View>
      <Text style={[s.gHint, { color: c.mutedForeground }]}>
        Requires an Apple Developer account ($99/yr). First build takes ~15 min.
        After that, scan the QR code and you're running native ML at ~10–30 ms/frame.
      </Text>
    </View>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function CounterScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  if (!nativeAvailable) return <BuildRequired c={c} />;
  return <DetectorScreen c={c} insets={insets} />;
}

// ─── DetectorScreen ───────────────────────────────────────────────────────────
function DetectorScreen({ c, insets }: { c: ReturnType<typeof useColors>; insets: ReturnType<typeof useSafeAreaInsets> }) {
  const queryClient = useQueryClient();
  const createSession = useCreateSession();

  // Camera
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [camW, setCamW] = useState(Dimensions.get('window').width);
  const [camH, setCamH] = useState(Dimensions.get('window').height);

  // Model
  const model = useTensorflowModel(
    require('../../assets/models/yolo11n.tflite'),
    ['core-ml', 'default'],
  );
  const modelReady = model.state === 'loaded';

  // Detection
  const trackerRef = useRef(new Tracker());
  const [tracks, setTracks] = useState<TrackedObject[]>([]);
  const isRunRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);

  // Counts + time
  const [counts, setCounts] = useState<Counts>({ ...DEFAULT_COUNTS });
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);

  // Speed
  const allSpeeds = useRef<number[]>([]);
  const [avgSpd, setAvgSpd] = useState<number | null>(null);
  const [maxSpd, setMaxSpd] = useState<number | null>(null);

  // Calibration
  const [ppm, setPpm] = useState(100);

  // Save modal
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveLoc, setSaveLoc] = useState('');
  const [saveNotes, setSaveNotes] = useState('');

  const total = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);

  // ── timer ─────────────────────────────────────────────────────────────────
  const startTimer = () => {
    startedAt.current = Date.now() - elapsed * 1000;
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 500);
  };
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // ── detection loop ─────────────────────────────────────────────────────────
  const runFrame = useCallback(async () => {
    if (!isRunRef.current || !cameraRef.current || !modelReady) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.35, base64: false, skipProcessing: true,
      });
      if (!photo?.uri || !isRunRef.current) return;

      const resized = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 320, height: 320 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: false },
      );
      if (!isRunRef.current) return;

      const ab = await (await fetch(resized.uri)).arrayBuffer();
      const dec = jpeg.decode(new Uint8Array(ab), { useTArray: true });
      const rgb = rgbaToModelInput(dec.data, dec.width, dec.height);

      const outputs = await model.model.run([rgb.buffer as ArrayBuffer]);
      if (!isRunRef.current) return;

      const dets = parseEfficientDet(outputs);
      const now = Date.now();
      const { tracks: newTracks, newlyCounted } = trackerRef.current.update(dets, now, ppm, 320, 320);
      setTracks(newTracks);

      if (newlyCounted.length > 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCounts((prev) => {
          const next = { ...prev };
          for (const obj of newlyCounted) {
            const m = CLASS_META[obj.className];
            if (m) next[m.key]++;
          }
          return next;
        });
      }

      const speeds = newTracks.map((t) => t.speedKph).filter((v): v is number => v !== null && v > 1);
      if (speeds.length > 0) {
        allSpeeds.current.push(...speeds);
        const all = allSpeeds.current;
        setAvgSpd(r1(all.reduce((a, b) => a + b, 0) / all.length));
        setMaxSpd(r1(Math.max(...all)));
      }
    } catch { /* swallow transient camera/network errors */ }

    if (isRunRef.current) setTimeout(runFrame, FRAME_INTERVAL_MS);
  }, [model, modelReady, ppm]);

  const handleStart = () => { isRunRef.current = true; setIsRunning(true); startTimer(); setTimeout(runFrame, 100); };
  const handleStop  = () => { isRunRef.current = false; setIsRunning(false); if (timerRef.current) clearInterval(timerRef.current); setTracks([]); };
  const handleReset = () => { handleStop(); setCounts({ ...DEFAULT_COUNTS }); setElapsed(0); allSpeeds.current = []; setAvgSpd(null); setMaxSpd(null); trackerRef.current.reset(); };

  const openSave = () => { handleStop(); setSaveName(`Session ${fmtDate(new Date())}`); setShowSave(true); };
  const submitSave = () => {
    createSession.mutate(
      { data: { name: saveName.trim() || `Session ${fmtDate(new Date())}`, source: 'camera', totalCars: counts.cars, totalPedestrians: counts.pedestrians, totalBikes: counts.bikes, totalMotorcycles: counts.motorcycles, totalTrucks: counts.trucks, totalBuses: counts.buses, durationSeconds: elapsed, avgSpeedKph: avgSpd, maxSpeedKph: maxSpd, location: saveLoc.trim() || undefined, notes: saveNotes.trim() || undefined } },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() }); setShowSave(false); handleReset(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } },
    );
  };

  // ── permission gate ────────────────────────────────────────────────────────
  if (!permission) return <View style={[s.center, { backgroundColor: c.background }]}><ActivityIndicator color={c.primary} /></View>;
  if (!permission.granted) {
    return (
      <View style={[s.center, { backgroundColor: c.background, paddingTop: insets.top + 20, paddingHorizontal: 32 }]}>
        <Ionicons name="camera-outline" size={56} color={c.mutedForeground} />
        <Text style={[s.gTitle, { color: c.foreground }]}>Camera Access</Text>
        <Text style={[s.gBody, { color: c.mutedForeground }]}>Allow camera access to detect vehicles automatically.</Text>
        <TouchableOpacity style={[s.permBtn, { backgroundColor: c.primary }]} onPress={requestPermission}>
          <Text style={[s.permBtnTxt, { color: c.primaryForeground }]}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── main UI ───────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { backgroundColor: c.background }]} onLayout={(e) => { setCamW(e.nativeEvent.layout.width); setCamH(e.nativeEvent.layout.height); }}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      <View style={s.scrim} />
      <BBoxOverlay tracks={tracks} w={camW} h={camH} />

      {/* ── HUD ─────────────────────────────────────────────────────── */}
      <View style={[s.hud, { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 12), backgroundColor: c.background + 'e0', borderBottomColor: c.border }]}>
        <View style={s.hudRow}>
          <View style={s.stat}><Text style={[s.lbl, { color: c.mutedForeground }]}>TOTAL</Text><Text style={[s.bigNum, { color: c.foreground }]}>{total}</Text></View>
          <View style={[s.pill, { backgroundColor: isRunning ? '#22c55e22' : c.secondary, borderColor: isRunning ? '#22c55e66' : c.border }]}>
            <View style={[s.dot, { backgroundColor: isRunning ? '#22c55e' : !modelReady ? '#f59e0b' : c.mutedForeground }]} />
            <Text style={[s.pillTxt, { color: isRunning ? '#22c55e' : !modelReady ? '#f59e0b' : c.mutedForeground }]}>
              {isRunning ? 'DETECTING' : !modelReady ? 'LOADING…' : 'READY'}
            </Text>
          </View>
          <View style={s.stat}><Text style={[s.lbl, { color: c.mutedForeground }]}>TIME</Text><Text style={[s.mono, { color: c.foreground }]}>{fmtTime(elapsed)}</Text></View>
        </View>

        <View style={[s.speedRow, { borderTopColor: c.border + '55' }]}>
          {[
            { l: 'AVG SPEED', v: avgSpd, color: c.foreground },
            { l: 'MAX SPEED', v: maxSpd, color: maxSpd !== null ? c.primary : c.foreground },
            { l: 'TRACKED',   v: tracks.length, color: c.foreground, noUnit: true },
          ].map((x, i) => (
            <React.Fragment key={i}>
              {i > 0 && <View style={[s.div, { backgroundColor: c.border }]} />}
              <View style={s.speedItem}>
                <Text style={[s.lbl, { color: c.mutedForeground }]}>{x.l}</Text>
                <Text style={[s.speedNum, { color: x.color }]}>
                  {x.v !== null ? x.v : '--'}{!x.noUnit && <Text style={[s.unit, { color: c.mutedForeground }]}> km/h</Text>}
                </Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        <View style={[s.chips, { borderTopColor: c.border + '44' }]}>
          {Object.entries(CLASS_META).map(([cls, m]) => <Chip key={cls} icon={m.icon} count={counts[m.key]} color={m.color} />)}
        </View>
      </View>

      {/* Model loading */}
      {!modelReady && (
        <View style={[s.banner, { backgroundColor: model.state === 'error' ? '#ef444422' : '#f59e0b22', borderColor: model.state === 'error' ? '#ef444455' : '#f59e0b55' }]}>
          {model.state === 'error' ? <Ionicons name="warning-outline" size={16} color="#ef4444" /> : <ActivityIndicator size="small" color="#f59e0b" />}
          <Text style={[s.bannerTxt, { color: model.state === 'error' ? '#ef4444' : '#f59e0b' }]}>
            {model.state === 'error' ? 'Model failed to load — restart the app' : 'Loading EfficientDet model (CoreML)…'}
          </Text>
        </View>
      )}

      {/* Calibration */}
      {!isRunning && (
        <View style={[s.calib, { backgroundColor: c.background + 'e0', borderColor: c.border }]}>
          <MaterialCommunityIcons name="ruler" size={12} color={c.mutedForeground} />
          <Text style={[s.calibLbl, { color: c.mutedForeground }]}>Pixels/m:</Text>
          {[-10, 10].map((d) => (
            <TouchableOpacity key={d} style={[s.calibBtn, { backgroundColor: c.secondary }]} onPress={() => setPpm((p) => Math.max(10, Math.min(500, p + d)))}>
              <Ionicons name={d < 0 ? 'remove' : 'add'} size={12} color={c.foreground} />
            </TouchableOpacity>
          ))}
          <Text style={[s.calibVal, { color: c.foreground }]}>{ppm}</Text>
          <Text style={[s.calibHint, { color: c.mutedForeground }]}>(pixels spanning 1 m)</Text>
        </View>
      )}

      {/* Controls */}
      <View style={[s.ctrl, { paddingBottom: insets.bottom + BOTTOM_EXTRA, backgroundColor: c.background + 'f0', borderTopColor: c.border }]}>
        <View style={s.ctrlRow}>
          {!isRunning ? (
            <>
              <TouchableOpacity style={[s.iconBtn, { backgroundColor: c.secondary, borderColor: c.border }]} onPress={handleReset}><Ionicons name="refresh" size={20} color={c.foreground} /></TouchableOpacity>
              <TouchableOpacity style={[s.priBtn, { backgroundColor: modelReady ? c.primary : c.muted }]} onPress={handleStart} disabled={!modelReady}>
                <Ionicons name="play" size={20} color={modelReady ? c.primaryForeground : c.mutedForeground} />
                <Text style={[s.btnLbl, { color: modelReady ? c.primaryForeground : c.mutedForeground }]}>Detect</Text>
              </TouchableOpacity>
              {total > 0 && <TouchableOpacity style={[s.iconBtn, { backgroundColor: '#22c55e22', borderColor: '#22c55e55' }]} onPress={openSave}><Ionicons name="save-outline" size={20} color="#22c55e" /></TouchableOpacity>}
            </>
          ) : (
            <>
              <TouchableOpacity style={[s.stopBtn, { backgroundColor: '#ef444422', borderColor: '#ef444455' }]} onPress={handleStop}>
                <Ionicons name="stop" size={20} color="#ef4444" /><Text style={[s.btnLbl, { color: '#ef4444' }]}>Stop</Text>
              </TouchableOpacity>
              {total > 0 && <TouchableOpacity style={[s.iconBtn, { backgroundColor: '#22c55e22', borderColor: '#22c55e55' }]} onPress={openSave}><Ionicons name="save-outline" size={20} color="#22c55e" /></TouchableOpacity>}
            </>
          )}
        </View>
      </View>

      {/* Save modal */}
      <Modal visible={showSave} animationType="slide" presentationStyle="formSheet">
        <View style={[s.modal, { backgroundColor: c.background }]}>
          <View style={[s.modalHdr, { borderBottomColor: c.border, paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16) }]}>
            <TouchableOpacity onPress={() => setShowSave(false)}><Ionicons name="close" size={24} color={c.mutedForeground} /></TouchableOpacity>
            <Text style={[s.modalTitle, { color: c.foreground }]}>Save Session</Text>
            <TouchableOpacity onPress={submitSave} disabled={createSession.isPending}>
              {createSession.isPending ? <ActivityIndicator size="small" color={c.primary} /> : <Text style={[s.modalSave, { color: c.primary }]}>Save</Text>}
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            <View style={[s.sumRow, { backgroundColor: c.card, borderColor: c.border }]}>
              {Object.entries(CLASS_META).map(([cls, m]) => (
                <View key={cls} style={s.sumItem}><MaterialCommunityIcons name={m.icon as any} size={16} color={m.color} /><Text style={[s.sumN, { color: c.foreground }]}>{counts[m.key]}</Text></View>
              ))}
            </View>
            <View style={[s.spdSum, { backgroundColor: c.card, borderColor: c.border }]}>
              {[{ l:'AVG', v: avgSpd !== null ? `${avgSpd} km/h` : '--', color: c.foreground }, { l:'MAX', v: maxSpd !== null ? `${maxSpd} km/h` : '--', color: maxSpd !== null ? c.primary : c.foreground }, { l:'DURATION', v: fmtTime(elapsed), color: c.foreground }].map((x, i) => (
                <React.Fragment key={i}>{i > 0 && <View style={[s.div, { backgroundColor: c.border }]} />}<View style={s.speedItem}><Text style={[s.lbl, { color: c.mutedForeground }]}>{x.l}</Text><Text style={[s.speedNum, { color: x.color }]}>{x.v}</Text></View></React.Fragment>
              ))}
            </View>
            {[
              { lbl: 'SESSION NAME', val: saveName,  set: setSaveName,  ph: '' },
              { lbl: 'LOCATION',     val: saveLoc,   set: setSaveLoc,   ph: 'e.g. Main St & 4th Ave' },
              { lbl: 'NOTES',        val: saveNotes, set: setSaveNotes, ph: 'Weather, visibility…', multi: true },
            ].map(({ lbl, val, set, ph, multi }) => (
              <React.Fragment key={lbl}>
                <Text style={[s.fldLbl, { color: c.mutedForeground }]}>{lbl}</Text>
                <TextInput style={[s.input, multi && s.inputTall, { backgroundColor: c.card, borderColor: c.border, color: c.foreground }]} value={val} onChangeText={set} placeholder={ph} placeholderTextColor={c.mutedForeground} multiline={multi} />
              </React.Fragment>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,13,26,0.4)' },
  // gate
  gTitle: { fontSize: 21, fontWeight: '700', marginTop: 14, textAlign: 'center' },
  gBody: { fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 6 },
  gCard: { width: '100%', borderWidth: 1, borderRadius: 10, padding: 14, marginTop: 8 },
  gCode: { fontSize: 12, lineHeight: 22, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  gHint: { fontSize: 11, textAlign: 'center', marginTop: 8 },
  permBtn: { marginTop: 18, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 10 },
  permBtnTxt: { fontSize: 15, fontWeight: '700' },
  // hud
  hud: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1 },
  hudRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 },
  stat: { alignItems: 'center', minWidth: 64 },
  lbl: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 1 },
  bigNum: { fontSize: 30, fontWeight: '800' },
  mono: { fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillTxt: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  speedRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  speedItem: { flex: 1, alignItems: 'center' },
  speedNum: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  unit: { fontSize: 10 },
  div: { width: StyleSheet.hairlineWidth, height: 26, marginHorizontal: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  chipN: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  // bboxes
  bbox: { position: 'absolute', borderWidth: 2, borderRadius: 3 },
  bboxTag: { position: 'absolute', top: -18, left: 0, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },
  bboxTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
  // banner
  banner: { marginHorizontal: 16, marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, borderWidth: 1 },
  bannerTxt: { fontSize: 12, flex: 1, fontWeight: '500' },
  // calib
  calib: { marginHorizontal: 16, marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, borderWidth: 1, borderRadius: 8 },
  calibLbl: { fontSize: 11, fontWeight: '600' },
  calibBtn: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  calibVal: { fontSize: 13, fontWeight: '700', minWidth: 36, textAlign: 'center', fontVariant: ['tabular-nums'] },
  calibHint: { fontSize: 10, flex: 1 },
  // controls
  ctrl: { paddingHorizontal: 20, paddingTop: 10, borderTopWidth: 1 },
  ctrlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  iconBtn: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  priBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 25 },
  stopBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 36, paddingVertical: 14, borderRadius: 25, borderWidth: 1 },
  btnLbl: { fontSize: 15, fontWeight: '700' },
  // modal
  modal: { flex: 1 },
  modalHdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalSave: { fontSize: 17, fontWeight: '700' },
  modalBody: { flex: 1, padding: 20 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 10, borderWidth: 1, marginBottom: 2 },
  sumItem: { alignItems: 'center', gap: 4 },
  sumN: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  spdSum: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 20 },
  fldLbl: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6, marginTop: 16 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 15 },
  inputTall: { height: 80, textAlignVertical: 'top' },
  muted: {},
});
