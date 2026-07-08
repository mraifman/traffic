import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  useListSessions,
  useDeleteSession,
  getListSessionsQueryKey,
  type Session,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import colors from '@/constants/colors';

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(sec: number | null) {
  if (sec == null) return '--';
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function SessionCard({ session, onDelete }: { session: Session; onDelete: () => void }) {
  const c = useColors();
  const [expanded, setExpanded] = useState(false);

  const total =
    session.totalCars +
    session.totalPedestrians +
    session.totalBikes +
    session.totalMotorcycles +
    session.totalTrucks +
    session.totalBuses;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
      onPress={() => setExpanded((p) => !p)}
      activeOpacity={0.8}
      testID={`session-card-${session.id}`}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardMain}>
          <Text style={[styles.cardName, { color: c.foreground }]} numberOfLines={1}>
            {session.name}
          </Text>
          <Text style={[styles.cardDate, { color: c.mutedForeground }]}>
            {formatDate(session.startedAt)}
          </Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={[styles.cardTotal, { color: c.primary }]}>{total}</Text>
          <Text style={[styles.cardTotalLabel, { color: c.mutedForeground }]}>objects</Text>
        </View>
      </View>

      {/* Speed pills */}
      {(session.avgSpeedKph != null || session.maxSpeedKph != null) && (
        <View style={styles.speedRow}>
          {session.avgSpeedKph != null && (
            <View style={[styles.pill, { backgroundColor: c.secondary }]}>
              <Text style={[styles.pillText, { color: c.mutedForeground }]}>
                avg <Text style={{ color: c.foreground }}>{session.avgSpeedKph.toFixed(1)}</Text> km/h
              </Text>
            </View>
          )}
          {session.maxSpeedKph != null && (
            <View style={[styles.pill, { backgroundColor: c.secondary }]}>
              <Text style={[styles.pillText, { color: c.mutedForeground }]}>
                max <Text style={{ color: c.primary }}>{session.maxSpeedKph.toFixed(1)}</Text> km/h
              </Text>
            </View>
          )}
          <View style={[styles.pill, { backgroundColor: c.secondary }]}>
            <Text style={[styles.pillText, { color: c.mutedForeground }]}>
              {formatDuration(session.durationSeconds ?? null)}
            </Text>
          </View>
        </View>
      )}

      {/* Expanded breakdown */}
      {expanded && (
        <View style={[styles.breakdown, { borderTopColor: c.border }]}>
          <View style={styles.breakdownGrid}>
            {(
              [
                { key: 'cars', label: 'Cars', icon: 'car', val: session.totalCars, color: colors.vehicles.cars },
                { key: 'pedestrians', label: 'People', icon: 'walk', val: session.totalPedestrians, color: colors.vehicles.pedestrians },
                { key: 'bikes', label: 'Bicycles', icon: 'bicycle', val: session.totalBikes, color: colors.vehicles.bikes },
                { key: 'motorcycles', label: 'Motos', icon: 'motorbike', val: session.totalMotorcycles, color: colors.vehicles.motorcycles },
                { key: 'trucks', label: 'Trucks', icon: 'truck', val: session.totalTrucks, color: colors.vehicles.trucks },
                { key: 'buses', label: 'Buses', icon: 'bus', val: session.totalBuses, color: colors.vehicles.buses },
              ] as const
            ).map((item) => (
              <View key={item.key} style={styles.breakdownItem}>
                <MaterialCommunityIcons name={item.icon as any} size={16} color={item.color} />
                <Text style={[styles.breakdownCount, { color: c.foreground }]}>{item.val}</Text>
                <Text style={[styles.breakdownLabel, { color: c.mutedForeground }]}>{item.label}</Text>
              </View>
            ))}
          </View>

          {session.location && (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={14} color={c.mutedForeground} />
              <Text style={[styles.metaText, { color: c.mutedForeground }]}>{session.location}</Text>
            </View>
          )}
          {session.notes && (
            <View style={styles.metaRow}>
              <Ionicons name="document-text-outline" size={14} color={c.mutedForeground} />
              <Text style={[styles.metaText, { color: c.mutedForeground }]}>{session.notes}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.deleteBtn, { borderColor: '#ef444444' }]}
            onPress={onDelete}
            testID={`btn-delete-${session.id}`}
          >
            <Ionicons name="trash-outline" size={16} color="#ef4444" />
            <Text style={styles.deleteBtnText}>Delete session</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function SessionsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: sessions, isLoading, isError, refetch } = useListSessions();
  const deleteSession = useDeleteSession();

  const handleDelete = (id: number) => {
    const doDelete = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      deleteSession.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        }
      );
    };

    if (Platform.OS === 'web') {
      doDelete();
    } else {
      Alert.alert('Delete Session', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: c.background, paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <Text style={[styles.headerTitle, { color: c.foreground }]}>Sessions</Text>
        <Text style={[styles.headerSub, { color: c.mutedForeground }]}>
          {Array.isArray(sessions) ? `${sessions.length} saved` : ''}
        </Text>
      </View>

      {isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={c.primary} />
        </View>
      )}

      {isError && (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={c.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: c.foreground }]}>Cannot connect</Text>
          <Text style={[styles.emptyDesc, { color: c.mutedForeground }]}>Check your network and try again.</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: c.secondary }]}
            onPress={() => refetch()}
          >
            <Text style={[styles.retryText, { color: c.foreground }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isLoading && !isError && (
        <FlatList
          data={Array.isArray(sessions) ? [...sessions].reverse() : []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 12) },
          ]}
          scrollEnabled={Array.isArray(sessions) && sessions.length > 0}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={c.primary}
            />
          }
          renderItem={({ item }) => (
            <SessionCard session={item} onDelete={() => handleDelete(item.id)} />
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <MaterialCommunityIcons name="clipboard-list-outline" size={52} color={c.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: c.foreground }]}>No sessions yet</Text>
              <Text style={[styles.emptyDesc, { color: c.mutedForeground }]}>
                Go to the Counter tab and save your first session.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  header: {
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8,
  },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  headerSub: { fontSize: 13, fontWeight: '500' },
  list: { padding: 16, gap: 10 },

  card: { borderRadius: 12, borderWidth: 1, padding: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  cardMain: { flex: 1, gap: 3 },
  cardName: { fontSize: 15, fontWeight: '700' },
  cardDate: { fontSize: 12 },
  cardRight: { alignItems: 'flex-end' },
  cardTotal: { fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  cardTotalLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1, marginTop: -2 },

  speedRow: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  pillText: { fontSize: 11, fontWeight: '600' },

  breakdown: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, gap: 10 },
  breakdownGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  breakdownItem: { alignItems: 'center', gap: 3, minWidth: 52 },
  breakdownCount: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  breakdownLabel: { fontSize: 10, fontWeight: '600' },

  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  metaText: { fontSize: 12, flex: 1 },

  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start', marginTop: 4 },
  deleteBtnText: { color: '#ef4444', fontSize: 13, fontWeight: '600' },

  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 8 },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  retryBtn: { marginTop: 12, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { fontSize: 14, fontWeight: '600' },
});
