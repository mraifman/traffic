import React, { useState, useRef, useEffect, useCallback } from 'react';
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
import {
  useCreateSession,
  getListSessionsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

type VehicleKey = 'cars' | 'pedestrians' | 'bikes' | 'motorcycles' | 'trucks' | 'buses';

const VEHICLES: {
  key: VehicleKey;
  label: string;
  icon: string;
  color: string;
}[] = [
  { key: 'cars', label: 'Car', icon: 'car', color: colors.vehicles.cars },
  { key: 'pedestrians', label: 'Person', icon: 'walk', color: colors.vehicles.pedestrians },
  { key: 'bikes', label: 'Bicycle', icon: 'bicycle', color: colors.vehicles.bikes },
  { key: 'motorcycles', label: 'Moto', icon: 'motorbike', color: colors.vehicles.motorcycles },
  { key: 'trucks', label: 'Truck', icon: 'truck', color: colors.vehicles.trucks },
  { key: 'buses', label: 'Bus', icon: 'bus', color: colors.vehicles.buses },
];

type Counts = Record<VehicleKey, number>;

const DEFAULT_COUNTS: Counts = {
  cars: 0,
  pedestrians: 0,
  bikes: 0,
  motorcycles: 0,
  trucks: 0,
  buses: 0,
};

// Animated press-feedback button
function CountButton({
  vehicle,
  count,
  onPress,
  disabled,
}: {
  vehicle: (typeof VEHICLES)[0];
  count: number;
  onPress: () => void;
  disabled: boolean;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSequence(withSpring(0.88, { duration: 80 }), withSpring(1, { duration: 120 }));
    onPress();
  };

  return (
    <Animated.View style={[styles.countButtonWrap, animStyle]}>
      <TouchableOpacity
        style={[styles.countButton, { borderColor: vehicle.color + '55' }]}
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

function formatElapsed(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatDate(d: Date) {
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CounterScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const queryClient = useQueryClient();
  const createSession = useCreateSession();

  const [counts, setCounts] = useState<Counts>({ ...DEFAULT_COUNTS });
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showSave, setShowSave] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [sessionLocation, setSessionLocation] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const startCounting = () => {
    startTimeRef.current = Date.now() - elapsed * 1000;
    setIsRunning(true);
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 500);
  };

  const stopCounting = () => {
    setIsRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const resetCounting = () => {
    stopCounting();
    setCounts({ ...DEFAULT_COUNTS });
    setElapsed(0);
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const handleTap = (key: VehicleKey) => {
    if (!isRunning) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCounts((prev) => ({ ...prev, [key]: prev[key] + 1 }));
  };

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
          avgSpeedKph: null,
          maxSpeedKph: null,
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

  // --- Permission states ---
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
        <TouchableOpacity
          style={[styles.permBtn, { backgroundColor: c.primary }]}
          onPress={requestPermission}
        >
          <Text style={[styles.permBtnText, { color: c.primaryForeground }]}>Allow Camera</Text>
        </TouchableOpacity>
        {Platform.OS !== 'web' && !permission.canAskAgain && (
          <Text style={[styles.permHint, { color: c.mutedForeground }]}>
            Enable camera permission in Settings.
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Camera background */}
      <CameraView style={StyleSheet.absoluteFill} facing="back" />

      {/* Dark scrim over camera */}
      <View style={styles.scrim} />

      {/* Top HUD */}
      <View
        style={[
          styles.hud,
          {
            paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 12),
            backgroundColor: c.background + 'cc',
            borderBottomColor: c.border,
          },
        ]}
      >
        <View style={styles.hudRow}>
          <View style={styles.hudStat}>
            <Text style={[styles.hudLabel, { color: c.mutedForeground }]}>TOTAL</Text>
            <Text style={[styles.hudValue, { color: c.foreground }]}>{total}</Text>
          </View>
          <View
            style={[
              styles.statusPill,
              { backgroundColor: isRunning ? '#22c55e22' : c.secondary, borderColor: isRunning ? '#22c55e55' : c.border },
            ]}
          >
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
      </View>

      {/* Counter grid */}
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

      {/* Bottom controls */}
      <View
        style={[
          styles.controls,
          {
            paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 12),
            backgroundColor: c.background + 'ee',
            borderTopColor: c.border,
          },
        ]}
      >
        {!isRunning ? (
          <View style={styles.controlRow}>
            <TouchableOpacity
              style={[styles.ctrlBtn, { backgroundColor: c.secondary, borderColor: c.border }]}
              onPress={resetCounting}
              testID="btn-reset"
            >
              <Ionicons name="refresh" size={20} color={c.foreground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ctrlBtnPrimary, { backgroundColor: c.primary }]}
              onPress={startCounting}
              testID="btn-start"
            >
              <Ionicons name="play" size={20} color={c.primaryForeground} />
              <Text style={[styles.ctrlBtnLabel, { color: c.primaryForeground }]}>Start</Text>
            </TouchableOpacity>
            {total > 0 && (
              <TouchableOpacity
                style={[styles.ctrlBtn, { backgroundColor: '#22c55e22', borderColor: '#22c55e55' }]}
                onPress={handleSaveOpen}
                testID="btn-save"
              >
                <Ionicons name="save-outline" size={20} color="#22c55e" />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.ctrlBtnDestructive, { backgroundColor: '#ef444422', borderColor: '#ef444455' }]}
            onPress={stopCounting}
            testID="btn-stop"
          >
            <Ionicons name="stop" size={20} color="#ef4444" />
            <Text style={[styles.ctrlBtnLabel, { color: '#ef4444' }]}>Stop</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Save modal */}
      <Modal visible={showSave} animationType="slide" presentationStyle="formSheet" transparent={false}>
        <View style={[styles.modal, { backgroundColor: c.background }]}>
          <View
            style={[
              styles.modalHeader,
              { borderBottomColor: c.border, paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 16) },
            ]}
          >
            <TouchableOpacity onPress={() => setShowSave(false)} testID="btn-cancel-save">
              <Ionicons name="close" size={24} color={c.mutedForeground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: c.foreground }]}>Save Session</Text>
            <TouchableOpacity onPress={handleSaveSubmit} disabled={createSession.isPending} testID="btn-confirm-save">
              {createSession.isPending ? (
                <ActivityIndicator size="small" color={c.primary} />
              ) : (
                <Text style={[styles.modalSave, { color: c.primary }]}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            {/* Summary */}
            <View style={[styles.summaryRow, { backgroundColor: c.card, borderColor: c.border }]}>
              {VEHICLES.map((v) => (
                <View key={v.key} style={styles.summaryItem}>
                  <MaterialCommunityIcons name={v.icon as any} size={16} color={v.color} />
                  <Text style={[styles.summaryCount, { color: c.foreground }]}>{counts[v.key]}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.summaryMeta, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.summaryMetaText, { color: c.mutedForeground }]}>
                {total} objects · {formatElapsed(elapsed)}
              </Text>
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
  hud: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  hudRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hudStat: { alignItems: 'center' },
  hudLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 2 },
  hudValue: { fontSize: 32, fontWeight: '800' },
  hudValueMono: { fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  // Grid
  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingVertical: 16,
    alignContent: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  countButtonWrap: { width: '30%' },
  countButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(7,13,26,0.75)',
    gap: 4,
  },
  countBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  countNum: { fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  countLabel: { fontSize: 11, color: '#8fa3b8', fontWeight: '600', letterSpacing: 0.5 },

  // Controls
  controls: { paddingHorizontal: 24, paddingTop: 12, borderTopWidth: 1 },
  controlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  ctrlBtn: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  ctrlBtnPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 32, paddingVertical: 14, borderRadius: 28,
  },
  ctrlBtnDestructive: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 48, paddingVertical: 14, borderRadius: 28, borderWidth: 1,
    alignSelf: 'center',
  },
  ctrlBtnLabel: { fontSize: 15, fontWeight: '700' },

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
  summaryMeta: { padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 20, alignItems: 'center' },
  summaryMetaText: { fontSize: 13, fontWeight: '600' },
  fieldLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 6, marginTop: 16 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 15 },
  inputMulti: { height: 80, textAlignVertical: 'top' },
});
