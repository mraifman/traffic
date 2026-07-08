import React from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

const STEPS = [
  {
    num: 1,
    icon: 'location-outline' as const,
    title: 'Camera Placement',
    body: 'Mount your phone 3–6 metres above the road on a tripod, bracket, or railing. The higher the vantage point, the less occlusion between objects.',
    tip: 'Aim for a clear line of sight across at least 15–20 metres of road.',
  },
  {
    num: 2,
    icon: 'scan-outline' as const,
    title: 'Camera Angle',
    body: 'Point the lens so that vehicles cross the frame from left to right (or right to left), not coming toward you. A perpendicular view gives the most accurate counts.',
    tip: 'Tilt down ~20–30° from horizontal to capture the full road width.',
  },
  {
    num: 3,
    icon: 'sunny-outline' as const,
    title: 'Lighting Conditions',
    body: 'Avoid pointing directly into the sun. Shade the lens if necessary. Low-light conditions (dawn, dusk) reduce accuracy — choose well-lit periods when possible.',
    tip: 'Mid-morning or afternoon light works best for contrast.',
  },
  {
    num: 4,
    icon: 'speedometer-outline' as const,
    title: 'Speed Calibration (Web)',
    body: 'Speed estimation is available in the web app. Identify a known distance in the camera frame (e.g. a lane is ~3.5 m wide), then set the Pixels/Meter slider to match. The web app uses ML detection to auto-track objects.',
    tip: 'Open the web Traffic Analyzer for ML-powered speed estimation.',
  },
  {
    num: 5,
    icon: 'hand-left-outline' as const,
    title: 'How to Count (Mobile)',
    body: 'Press Start, then tap each vehicle button as it passes. Each tap increments that class. Tap Stop when done, then Save to store the session.',
    tip: 'Use two hands — hold the phone in one hand, tap with the other for the best accuracy.',
  },
  {
    num: 6,
    icon: 'bar-chart-outline' as const,
    title: 'Reviewing Results',
    body: 'Saved sessions are stored on the server and visible in the Sessions tab and the web app. You can sort, filter, and export session data from the web interface.',
    tip: 'Sessions created on mobile sync automatically — no manual export needed.',
  },
];

const VEHICLE_TIPS = [
  { icon: 'car', color: '#3b82f6', label: 'Cars', tip: 'Sedans, SUVs, hatchbacks' },
  { icon: 'walk', color: '#22c55e', label: 'Pedestrians', tip: 'People on foot' },
  { icon: 'bicycle', color: '#f59e0b', label: 'Bicycles', tip: 'Pedal cycles, e-bikes' },
  { icon: 'motorbike', color: '#a855f7', label: 'Motorcycles', tip: 'Mopeds, motorbikes' },
  { icon: 'truck', color: '#f97316', label: 'Trucks', tip: 'Lorries, vans, flatbeds' },
  { icon: 'bus', color: '#ef4444', label: 'Buses', tip: 'Public/private buses' },
];

export default function SetupScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: c.background, paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Text style={[styles.headerTitle, { color: c.foreground }]}>Setup Guide</Text>
        <Text style={[styles.headerSub, { color: c.mutedForeground }]}>
          Field deployment instructions
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 20) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Vehicle classes */}
        <Text style={[styles.sectionTitle, { color: c.mutedForeground }]}>VEHICLE CLASSES</Text>
        <View style={[styles.vehicleGrid, { backgroundColor: c.card, borderColor: c.border }]}>
          {VEHICLE_TIPS.map((v) => (
            <View key={v.label} style={styles.vehicleItem}>
              <MaterialCommunityIcons name={v.icon as any} size={22} color={v.color} />
              <Text style={[styles.vehicleLabel, { color: c.foreground }]}>{v.label}</Text>
              <Text style={[styles.vehicleTip, { color: c.mutedForeground }]}>{v.tip}</Text>
            </View>
          ))}
        </View>

        {/* Steps */}
        <Text style={[styles.sectionTitle, { color: c.mutedForeground }]}>DEPLOYMENT STEPS</Text>
        {STEPS.map((step) => (
          <View key={step.num} style={[styles.stepCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.stepHeader}>
              <View style={[styles.stepNum, { backgroundColor: c.primary + '22', borderColor: c.primary + '44' }]}>
                <Text style={[styles.stepNumText, { color: c.primary }]}>{step.num}</Text>
              </View>
              <View style={styles.stepTitleRow}>
                <Ionicons name={step.icon} size={18} color={c.primary} />
                <Text style={[styles.stepTitle, { color: c.foreground }]}>{step.title}</Text>
              </View>
            </View>
            <Text style={[styles.stepBody, { color: c.mutedForeground }]}>{step.body}</Text>
            <View style={[styles.tipRow, { backgroundColor: c.primary + '11', borderColor: c.primary + '33' }]}>
              <Ionicons name="bulb-outline" size={14} color={c.primary} />
              <Text style={[styles.tipText, { color: c.primary }]}>{step.tip}</Text>
            </View>
          </View>
        ))}

        {/* Accuracy note */}
        <View style={[styles.noteCard, { backgroundColor: '#f59e0b11', borderColor: '#f59e0b44' }]}>
          <Ionicons name="warning-outline" size={18} color="#f59e0b" />
          <Text style={[styles.noteText, { color: '#f59e0b' }]}>
            Accuracy depends on camera placement, lighting, and occlusion. Always validate counts against a spot check for traffic studies.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  headerSub: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginTop: 8, marginBottom: 4 },

  vehicleGrid: { borderRadius: 12, borderWidth: 1, padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  vehicleItem: { width: '30%', alignItems: 'center', gap: 4, padding: 8 },
  vehicleLabel: { fontSize: 13, fontWeight: '700' },
  vehicleTip: { fontSize: 10, textAlign: 'center', lineHeight: 14 },

  stepCard: { borderRadius: 12, borderWidth: 1, padding: 16, gap: 10 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNum: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  stepNumText: { fontSize: 14, fontWeight: '800' },
  stepTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  stepTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  stepBody: { fontSize: 14, lineHeight: 22 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 8, padding: 10 },
  tipText: { fontSize: 12, flex: 1, lineHeight: 18, fontWeight: '500' },

  noteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 12, padding: 16 },
  noteText: { flex: 1, fontSize: 13, lineHeight: 20 },
});
