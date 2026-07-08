import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import colors from '@/constants/colors';
import { useCreateSession, getListSessionsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

// ─── types ────────────────────────────────────────────────────────────────────

type VehicleKey = 'cars' | 'pedestrians' | 'bikes' | 'motorcycles' | 'trucks' | 'buses';
type Counts = Record<VehicleKey, number>;

const DEFAULT_COUNTS: Counts = {
  cars: 0, pedestrians: 0, bikes: 0, motorcycles: 0, trucks: 0, buses: 0,
};

const VEHICLES: { key: VehicleKey; label: string; icon: string; color: string }[] = [
  { key: 'cars',         label: 'Car',     icon: 'car',      color: colors.vehicles.cars },
  { key: 'pedestrians',  label: 'Person',  icon: 'walk',     color: colors.vehicles.pedestrians },
  { key: 'bikes',        label: 'Bicycle', icon: 'bicycle',  color: colors.vehicles.bikes },
  { key: 'motorcycles',  label: 'Moto',    icon: 'motorbike',color: colors.vehicles.motorcycles },
  { key: 'trucks',       label: 'Truck',   icon: 'truck',    color: colors.vehicles.trucks },
  { key: 'buses',        label: 'Bus',     icon: 'bus',      color: colors.vehicles.buses },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function pad(n: number) { return n.toString().padStart(2, '0'); }
function formatElapsed(sec: number) { return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`; }
function formatDate(d: Date) {
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function round1(n: number) { return Math.round(n * 10) / 10; }

// Bottom padding: enough to clear the tab bar on iOS (liquid glass ~83px total, insets.bottom ~34px, so +50 extra)
const CTRL_BOTTOM_EXTRA = Platform.select({ ios: 50, web: 34, default: 12 })!;

// ─── CountButton ──────────────────────────────────────────────────────────────

function CountButton({
  vehicle, count, onPress, disabled,
}: {
  vehicle: (typeof VEHICLES)[0]; count: number; onPress: () => void; disabled: boolean;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const handlePress = () => {
    scale.value = withSequence(withSpring(0.86, { duration: 70 }), withSpring(1, { duration: 110 }));
    onPress();
  };
  return (
    <Animated.View style={[styles.btnWrap, style]}>
      <TouchableOpacity
        style={[styles.countBtn, { borderColor: vehicle.color + '55' }]}
        onPress={handlePress}
        activeOpacity={0.8}
        disabled={disabled}
        testID={`btn-${vehicle.key}`}
      >
        <View style={[styles.countBadge, { backgroundColor: vehicle.color + '22' }]}>
          <MaterialCommunityIcons name={vehicle.icon as any} size={26} color={vehicle.color} />
        </View>
        <Text style={[styles.countNum, { color: vehicle.color }]}>{count}</Text>
        <Text style={styles.countLabel}>{vehicle.label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CounterScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const queryClient = useQueryClient();
  const createSession = useCreateSession();

  // Counting state
  const [counts, setCounts] = useState<Counts>({ ...DEFAULT_COUNTS });
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  // Speed trap state
  const [trapDistanceM, setTrapDistanceM] = useState(10);   // calibrated zone length in metres
  const [trapArmed, setTrapArmed] = useState(false);         // true while timing a vehicle
  const trapStartRef = useRef(0);
  const [speeds, setSpeeds] = useState<number[]>([]);        // all measured speeds this session

  // Save modal
  const [showSave, setShowSave] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [sessionLocation, setSessionLocation] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const avgSpeed = speeds.length > 0 ? round1(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null;
  const maxSpeed = speeds.length > 0 ? round1(Math.max(...speeds)) : null;

  // ── timer ──────────────────────────────────────────────────────────────────
  const startCounting = () => {
    startTimeRef.current = Date.now() - elapsed * 1000;
    setIsRunning(true);
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 500);
  };
  const stopCounting = () => {
    setIsRunning(false);
    setTrapArmed(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };
  const resetCounting = () => {
    stopCounting();
    setCounts({ ...DEFAULT_COUNTS });
    setElapsed(0);
    setSpeeds([]);
  };
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // ── tap counter ────────────────────────────────────────────────────────────
  const handleTap = (key: VehicleKey) => {
    if (!isRunning) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCounts((prev) => ({ ...prev, [key]: prev[key] + 1 }));
  };

  // ── speed trap ─────────────────────────────────────────────────────────────
  // First tap: arm the trap (vehicle enters the zone)
  // Second tap: vehicle exits — compute speed = distance / time
  const handleTrap = () => {
    if (!isRunning) return;
    if (!trapArmed) {
      trapStartRef.current = Date.now();
      setTrapArmed(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else {
      const dtSec = (Date.now() - trapStartRef.current) / 1000;
      if (dtSec >= 0.1) {                               // ignore accidental double-taps
        const kph = round1((trapDistanceM / dtSec) * 3.6);
        setSpeeds((prev) => [...prev, kph]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setTrapArmed(false);
    }
  };

  // ── save ───────────────────────────────────────────────────────────────────
  const handleSaveOpen = () => {
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
          resetCounting();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
      }
    );
  };

  // ── permission gates ───────────────────────────────────────────────────────
  if (!permission) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }
  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: c.background, paddingTop: insets.top + 20 }]}>
        <Ionicons name="camera-outline" size={56} color={c.mutedForeground} />
        <Text style={[styles.permTitle, { color: c.foreground }]}>Camera Access</Text>
        <Text style={[styles.permDesc, { color: c.mutedForeground }]}>
          Point your phone at traffic and tap to count vehicles in real time.
        </Text>
        <TouchableOpacity style={[styles.permBtn, { backgroundColor: c.primary }]} onPress={requestPermission}>
          <Text style={[styles.permBtnText, { color: c.primaryForeground }]}>Allow Camera</Text>
        </TouchableOpacity>
        {Platform.OS !== 'web' && !permission.canAskAgain && (
          <Text style={[styles.permHint, { color: c.mutedForeground }]}>
            Enable camera in Settings to continue.
          </Text>
        )}
      </View>
    );
  }

  // ── main UI ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" />
      <View style={styles.scrim} />

      {/* ── Top HUD ────────────────────────────────────────────────────────── */}
      <View style={[styles.hud, {
        paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 12),
        backgroundColor: c.background + 'cc',
        borderBottomColor: c.border,
      }]}>
        {/* Row 1: Total | Status | Time */}
        <View style={styles.hudRow}>
          <View style={styles.hudStat}>
            <Text style={[styles.hudLabel, { color: c.mutedForeground }]}>TOTAL</Text>
            <Text style={[styles.hudValue, { color: c.foreground }]}>{total}</Text>
          </View>
          <View style={[styles.statusPill, {
            backgroundColor: isRunning ? '#22c55e22' : c.secondary,
            borderColor: isRunning ? '#22c55e55' : c.border,
          }]}>
            <View style={[styles.statusDot, { backgroundColor: isRunning ? '#22c55e' : c.mutedForeground }]} />
            <Text style={[styles.statusText, { color: isRunning ? '#22c55e' : c.mutedForeground }]}>
              {isRunning ? 'LIVE' : 'PAUSED'}
            </Text>
          </View>
          <View style={styles.hudStat}>
            <Text style={[styles.hudLabel, { color: c.mutedForeground }]}>TIME</Text>
            <Text style={[styles.hudValueMono, { color: c.foreground }]}>{formatElapsed(elapsed)}</Text>
          </View>
        </View>

        {/* Row 2: Speed stats (always shown; -- when no data yet) */}
        <View style={[styles.speedRow, { borderTopColor: c.border + '66' }]}>
          <View style={styles.speedStat}>
            <Text style={[styles.hudLabel, { color: c.mutedForeground }]}>AVG SPEED</Text>
            <Text style={[styles.speedValue, { color: c.foreground }]}>
              {avgSpeed !== null ? avgSpeed : '--'}
              <Text style={[styles.speedUnit, { color: c.mutedForeground }]}> km/h</Text>
            </Text>
          </View>
          <View style={[styles.speedDivider, { backgroundColor: c.border }]} />
          <View style={styles.speedStat}>
            <Text style={[styles.hudLabel, { color: c.mutedForeground }]}>MAX SPEED</Text>
            <Text style={[styles.speedValue, { color: maxSpeed !== null ? c.primary : c.foreground }]}>
              {maxSpeed !== null ? maxSpeed : '--'}
              <Text style={[styles.speedUnit, { color: c.mutedForeground }]}> km/h</Text>
            </Text>
          </View>
          <View style={[styles.speedDivider, { backgroundColor: c.border }]} />
          <View style={styles.speedStat}>
            <Text style={[styles.hudLabel, { color: c.mutedForeground }]}>SAMPLES</Text>
            <Text style={[styles.speedValue, { color: c.foreground }]}>{speeds.length}</Text>
          </View>
        </View>
      </View>

      {/* ── Vehicle counter grid ──────────────────────────────────────────── */}
      <View style={styles.grid}>
        {VEHICLES.map((v) => (
          <CountButton
            key={v.key}
            vehicle={v}
            count={counts[v.key]}
            onPress={() => handleTap(v.key)}
            disabled={!isRunning}
          />
        ))}
      </View>

      {/* ── Bottom controls ───────────────────────────────────────────────── */}
      <View style={[styles.controls, {
        paddingBottom: insets.bottom + CTRL_BOTTOM_EXTRA,
        backgroundColor: c.background + 'f0',
        borderTopColor: c.border,
      }]}>
        {!isRunning ? (
          <>
            {/* Calibration row: trap distance */}
            <View style={[styles.calibRow, { borderColor: c.border }]}>
              <MaterialCommunityIcons name="map-marker-distance" size={14} color={c.mutedForeground} />
              <Text style={[styles.calibLabel, { color: c.mutedForeground }]}>Trap zone:</Text>
              <TouchableOpacity
                style={[styles.calibBtn, { backgroundColor: c.secondary }]}
                onPress={() => setTrapDistanceM((d) => Math.max(1, d - 1))}
              >
                <Ionicons name="remove" size={14} color={c.foreground} />
              </TouchableOpacity>
              <Text style={[styles.calibValue, { color: c.foreground }]}>{trapDistanceM} m</Text>
              <TouchableOpacity
                style={[styles.calibBtn, { backgroundColor: c.secondary }]}
                onPress={() => setTrapDistanceM((d) => Math.min(100, d + 1))}
              >
                <Ionicons name="add" size={14} color={c.foreground} />
              </TouchableOpacity>
              <Text style={[styles.calibHint, { color: c.mutedForeground }]}>
                · {speeds.length > 0 ? `${speeds.length} meas.` : 'use TRAP while running'}
              </Text>
            </View>

            {/* Start / Reset / Save row */}
            <View style={styles.controlRow}>
              <TouchableOpacity
                style={[styles.ctrlIconBtn, { backgroundColor: c.secondary, borderColor: c.border }]}
                onPress={resetCounting}
                testID="btn-reset"
              >
                <Ionicons name="refresh" size={20} color={c.foreground} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ctrlPrimaryBtn, { backgroundColor: c.primary }]}
                onPress={startCounting}
                testID="btn-start"
              >
                <Ionicons name="play" size={20} color={c.primaryForeground} />
                <Text style={[styles.ctrlBtnLabel, { color: c.primaryForeground }]}>Start</Text>
              </TouchableOpacity>
              {total > 0 && (
                <TouchableOpacity
                  style={[styles.ctrlIconBtn, { backgroundColor: '#22c55e22', borderColor: '#22c55e55' }]}
                  onPress={handleSaveOpen}
                  testID="btn-save"
                >
                  <Ionicons name="save-outline" size={20} color="#22c55e" />
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          <View style={styles.controlRow}>
            {/* Stop */}
            <TouchableOpacity
              style={[styles.ctrlIconBtn, { backgroundColor: '#ef444422', borderColor: '#ef444455' }]}
              onPress={stopCounting}
              testID="btn-stop"
            >
              <Ionicons name="stop" size={20} color="#ef4444" />
            </TouchableOpacity>

            {/* Speed TRAP — prominent centre button */}
            <TouchableOpacity
              style={[
                styles.trapBtn,
                trapArmed
                  ? { backgroundColor: '#ef4444', borderColor: '#ef4444' }
                  : { backgroundColor: c.secondary, borderColor: c.primary + '88' },
              ]}
              onPress={handleTrap}
              testID="btn-trap"
            >
              <MaterialCommunityIcons
                name={trapArmed ? 'timer-stop' : 'timer-play-outline'}
                size={22}
                color={trapArmed ? '#fff' : c.primary}
              />
              <Text style={[styles.trapLabel, { color: trapArmed ? '#fff' : c.primary }]}>
                {trapArmed ? 'STOP' : 'TRAP'}
              </Text>
              {trapArmed && (
                <Text style={styles.trapSub}>vehicle in zone</Text>
              )}
            </TouchableOpacity>

            {/* Save shortcut (when there's data) */}
            {total > 0 && (
              <TouchableOpacity
                style={[styles.ctrlIconBtn, { backgroundColor: '#22c55e22', borderColor: '#22c55e55' }]}
                onPress={() => { stopCounting(); handleSaveOpen(); }}
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
            {/* Count summary */}
            <View style={[styles.summaryRow, { backgroundColor: c.card, borderColor: c.border }]}>
              {VEHICLES.map((v) => (
                <View key={v.key} style={styles.summaryItem}>
                  <MaterialCommunityIcons name={v.icon as any} size={16} color={v.color} />
                  <Text style={[styles.summaryCount, { color: c.foreground }]}>{counts[v.key]}</Text>
                </View>
              ))}
            </View>

            {/* Speed summary */}
            <View style={[styles.speedSummaryRow, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={styles.speedSummaryItem}>
                <Text style={[styles.speedSummaryLabel, { color: c.mutedForeground }]}>AVG</Text>
                <Text style={[styles.speedSummaryVal, { color: c.foreground }]}>
                  {avgSpeed !== null ? `${avgSpeed} km/h` : '--'}
                </Text>
              </View>
              <View style={[styles.speedDivider, { backgroundColor: c.border }]} />
              <View style={styles.speedSummaryItem}>
                <Text style={[styles.speedSummaryLabel, { color: c.mutedForeground }]}>MAX</Text>
                <Text style={[styles.speedSummaryVal, { color: maxSpeed !== null ? c.primary : c.foreground }]}>
                  {maxSpeed !== null ? `${maxSpeed} km/h` : '--'}
                </Text>
              </View>
              <View style={[styles.speedDivider, { backgroundColor: c.border }]} />
              <View style={styles.speedSummaryItem}>
                <Text style={[styles.speedSummaryLabel, { color: c.mutedForeground }]}>DURATION</Text>
                <Text style={[styles.speedSummaryVal, { color: c.foreground }]}>{formatElapsed(elapsed)}</Text>
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
              placeholder="Weather conditions, observations…"
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

// ─── styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,13,26,0.55)' },

  // Permission
  permTitle: { fontSize: 22, fontWeight: '700', marginTop: 16 },
  permDesc: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginTop: 8 },
  permBtn: { marginTop: 24, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 10 },
  permBtnText: { fontSize: 15, fontWeight: '700' },
  permHint: { fontSize: 12, marginTop: 12, textAlign: 'center' },

  // HUD
  hud: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1 },
  hudRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 },
  hudStat: { alignItems: 'center', minWidth: 64 },
  hudLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 2 },
  hudValue: { fontSize: 30, fontWeight: '800' },
  hudValueMono: { fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  // Speed row in HUD
  speedRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  speedStat: { flex: 1, alignItems: 'center' },
  speedDivider: { width: StyleSheet.hairlineWidth, height: 28, marginHorizontal: 4 },
  speedValue: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  speedUnit: { fontSize: 11, fontWeight: '500' },

  // Counter grid
  grid: {
    flex: 1, flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 12, paddingVertical: 10,
    alignContent: 'center', justifyContent: 'center', gap: 8,
  },
  btnWrap: { width: '30%' },
  countBtn: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, borderWidth: 1,
    backgroundColor: 'rgba(7,13,26,0.80)', gap: 3,
  },
  countBadge: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  countNum: { fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] },
  countLabel: { fontSize: 10, color: '#8fa3b8', fontWeight: '600', letterSpacing: 0.5 },

  // Controls
  controls: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  controlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 4 },

  // Calibration row
  calibRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 8, paddingHorizontal: 8, paddingVertical: 6,
    borderWidth: 1, borderRadius: 8,
  },
  calibLabel: { fontSize: 11, fontWeight: '600' },
  calibBtn: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  calibValue: { fontSize: 13, fontWeight: '700', minWidth: 32, textAlign: 'center', fontVariant: ['tabular-nums'] },
  calibHint: { fontSize: 10, flex: 1 },

  ctrlIconBtn: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  ctrlPrimaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 28, paddingVertical: 13, borderRadius: 25,
  },
  ctrlBtnLabel: { fontSize: 15, fontWeight: '700' },

  // Trap button
  trapBtn: {
    flex: 1, maxWidth: 200,
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 14, borderWidth: 1, gap: 2,
  },
  trapLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },
  trapSub: { fontSize: 9, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5 },

  // Modal
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalSave: { fontSize: 17, fontWeight: '700' },
  modalBody: { flex: 1, padding: 20 },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderRadius: 10, borderWidth: 1, marginBottom: 2,
  },
  summaryItem: { alignItems: 'center', gap: 4 },
  summaryCount: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  speedSummaryRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 20,
  },
  speedSummaryItem: { flex: 1, alignItems: 'center', gap: 3 },
  speedSummaryLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  speedSummaryVal: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6, marginTop: 16 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 15 },
  inputMulti: { height: 80, textAlignVertical: 'top' },
});
