import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { router, Stack, useFocusEffect, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { Button } from '@/components/button';
import { Card, Divider } from '@/components/card';
import { GradientSurface } from '@/components/gradient-surface';
import { Icon } from '@/components/icon';
import { RiderAvatar } from '@/components/rider-avatar';
import { formatAway, MeMarker, RiderMarker, riderMarkerKey, riderStatus } from '@/components/rider-marker';
import { AvatarFor, myLook, RiderSheet } from '@/components/rider-sheet';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNow } from '@/hooks/use-now';
import { useRiderIdentity } from '@/hooks/use-rider-identity';
import { useTheme } from '@/hooks/use-theme';
import { firebaseConfigured } from '@/lib/firebase';
import { distanceMeters, type LatLng } from '@/lib/geo';
import {
  CODE_LENGTH,
  createGroup,
  formatCode,
  joinGroup,
  leaveGroup,
  MAX_RIDERS,
  normalizeCode,
  reportGroupPosition,
  ridersOf,
  setGroupDestination,
  STALE_COLOR,
  syncMyLook,
  useGroupRide,
  type Rider,
  type RiderIdentity,
} from '@/lib/group-ride';

const NO_IDENTITY: RiderIdentity = { name: '', bike: null, avatar: null, photoUri: null };

export default function GroupScreen() {
  const theme = useTheme();
  const group = useGroupRide();
  const params = useLocalSearchParams<{ code?: string }>();
  // Name, bike and avatar come from Profile, Garage and "Your ride look", re-read on focus.
  const loaded = useRiderIdentity();
  const identity = loaded ?? NO_IDENTITY;

  // Whenever they change (and we're in a group), friends see the update.
  useEffect(() => {
    if (loaded && group.code) syncMyLook(loaded);
  }, [loaded, group.code]);

  // Going back while in a group: ask whether to leave/end it or keep it running.
  const db = useSQLiteContext();
  const amLeader = !!group.code && group.leader === group.me;
  // Lifts the block straight away (otherwise the same question would come back on leaving).
  const allowLeaveRef = useRef<() => void>(() => {});
  const allowLeave = usePreventRemove(!!group.code && !group.ended, ({ repeat }) => {
    const go = () => {
      allowLeaveRef.current();
      repeat();
    };
    Alert.alert(
      amLeader ? 'End the group ride?' : 'Leave the group ride?',
      amLeader
        ? `You lead group ${formatCode(group.code ?? '')}. Keep it running to come back to it, or end it for everyone.`
        : `You're in group ${formatCode(group.code ?? '')}. Keep it to stay on friends' maps, or leave it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: amLeader ? 'End group' : 'Leave group',
          style: 'destructive',
          onPress: async () => {
            await leaveGroup(db, { endForEveryone: amLeader });
            go();
          },
        },
        // Back to the dashboard with the group still on, like before.
        { text: 'Keep group', onPress: go },
      ],
    );
  });
  useEffect(() => {
    allowLeaveRef.current = allowLeave;
  });
  // iPhone: the native back button and swipe-back leave before the question above can be
  // asked. While in a group, use our own back button (it asks) and turn swipe-back off.
  const guard = Platform.OS === 'ios' && !!group.code && !group.ended;

  return (
    <>
    <Stack.Screen
      options={{
        gestureEnabled: !guard,
        headerLeft: guard ? () => <HeaderBack onPress={() => router.back()} /> : undefined,
      }}
    />
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled">
      {!firebaseConfigured ? (
        <Card>
          <ThemedText type="heading">Group rides aren&apos;t set up</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            This build of Yatri has no group server configured.
          </ThemedText>
        </Card>
      ) : group.code ? (
        <InGroup identity={identity} />
      ) : (
        <NotInGroup identity={identity} initialCode={params.code} />
      )}
    </ScrollView>
    </>
  );
}

/** iOS-style back chevron for the header, used where leaving has to ask first. */
function HeaderBack({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
      <Icon name="chevron-left" size={32} themeColor="accent" />
    </Pressable>
  );
}

function NotInGroup({ identity, initialCode }: { identity: RiderIdentity; initialCode?: string }) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const [code, setCode] = useState(() => normalizeCode(initialCode ?? ''));
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);

  const run = async (kind: 'create' | 'join') => {
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === 'create') await createGroup(db, identity);
      else await joinGroup(db, code, identity);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert(kind === 'create' ? 'Could not start a group' : 'Could not join', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const complete = code.length === CODE_LENGTH;
  const on = { color: theme.onAccent };

  return (
    <>
      {/* Hero: what this is, and the main action. */}
      <GradientSurface style={styles.hero}>
        <View style={styles.heroTop}>
          <RiderCluster />
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <ThemedText style={styles.liveText}>LIVE</ThemedText>
          </View>
        </View>
        <View style={styles.heroText}>
          <ThemedText style={[styles.heroTitle, on]}>Ride together</ThemedText>
          <ThemedText style={[styles.heroBody, on]}>
            Everyone&apos;s position and speed on one live map. Up to {MAX_RIDERS} riders.
          </ThemedText>
        </View>
        <Pressable
          onPress={() => run('create')}
          disabled={!!busy}
          accessibilityRole="button"
          accessibilityLabel="Create a group"
          style={({ pressed }) => [styles.heroButton, pressed && styles.pressedScale]}>
          {busy === 'create' ? (
            <ActivityIndicator color={theme.accent} />
          ) : (
            <Icon name="flag-variant" size={20} themeColor="accent" />
          )}
          <ThemedText style={[styles.heroButtonText, { color: theme.accent }]}>
            {busy === 'create' ? 'Creating…' : 'Create a group'}
          </ThemedText>
        </Pressable>
        <ThemedText style={[styles.heroHint, on]}>You&apos;ll lead, and get a code to share.</ThemedText>
      </GradientSurface>

      {/* Join: six boxes like a verification code; one hidden input does the typing. */}
      <Card>
        <View style={styles.joinHead}>
          <View style={[styles.joinIcon, { backgroundColor: theme.accentSoft }]}>
            <Icon name="ticket-confirmation-outline" size={20} themeColor="accent" />
          </View>
          <View style={styles.flex}>
            <ThemedText type="heading">Have a code?</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Join a friend&apos;s group ride.
            </ThemedText>
          </View>
        </View>
        <CodeBoxes value={code} onChange={setCode} onSubmit={() => complete && run('join')} />
        <Pressable
          onPress={() => run('join')}
          disabled={!complete || !!busy}
          accessibilityRole="button"
          accessibilityLabel="Join group"
          accessibilityState={{ disabled: !complete || !!busy }}
          style={({ pressed }) => [
            styles.joinButton,
            { backgroundColor: complete ? theme.accent : theme.backgroundSelected },
            pressed && styles.pressedScale,
          ]}>
          {busy === 'join' ? <ActivityIndicator color={theme.onAccent} /> : null}
          <ThemedText type="smallBold" style={[styles.joinText, { color: complete ? theme.onAccent : theme.textMuted }]}>
            {busy === 'join'
              ? 'Joining…'
              : complete
                ? 'Join group'
                : `Enter the ${CODE_LENGTH}-digit code`}
          </ThemedText>
          {complete && !busy ? <Icon name="arrow-right" size={20} color={theme.onAccent} /> : null}
        </Pressable>
      </Card>

      {/* How it works, in three glances. */}
      <View style={styles.steps}>
        {(
          [
            ['account-multiple-plus-outline', 'Create or join'],
            ['share-variant-outline', 'Share the code'],
            ['map-marker-radius-outline', 'See everyone live'],
          ] as const
        ).map(([icon, label], i) => (
          <View key={label} style={styles.step}>
            <View style={[styles.stepIcon, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <Icon name={icon} size={22} themeColor="accent" />
              <View style={[styles.stepNumber, { backgroundColor: theme.accent }]}>
                <ThemedText style={[styles.stepNumberText, on]}>{i + 1}</ThemedText>
              </View>
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              {label}
            </ThemedText>
          </View>
        ))}
      </View>

      {/* Who friends will see. */}
      <Pressable
        onPress={() => router.push('/ride-avatar')}
        accessibilityRole="button"
        accessibilityLabel="Change how friends see you"
        style={({ pressed }) => [
          styles.identity,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
          pressed && styles.pressed,
        ]}>
        <MyAvatar identity={identity} color={theme.accent} size={36} />
        <View style={styles.flex}>
          <ThemedText type="caption" themeColor="textMuted">
            You&apos;ll appear as
          </ThemedText>
          <ThemedText type="smallBold" numberOfLines={1}>
            {identity.name.trim() || 'Rider · add your name'}
            {identity.bike ? (
              <ThemedText type="small" themeColor="textSecondary">
                {`  ·  ${identity.bike}`}
              </ThemedText>
            ) : null}
          </ThemedText>
        </View>
        <ThemedText type="smallBold" themeColor="accent">
          Edit
        </ThemedText>
      </Pressable>
    </>
  );
}

/** Six code boxes over one invisible input, so paste and the keyboard work normally. */
function CodeBoxes({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: () => void }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.boxes}>
      {Array.from({ length: CODE_LENGTH }, (_, i) => {
        const char = value[i];
        const active = focused && (i === value.length || (i === CODE_LENGTH - 1 && value.length === CODE_LENGTH));
        return (
          <View
            key={i}
            style={[
              styles.box,
              {
                backgroundColor: theme.background,
                borderColor: active ? theme.accent : char ? theme.textMuted : theme.border,
                borderWidth: active ? 2 : 1,
              },
            ]}>
            <ThemedText style={styles.boxChar}>{char ?? ''}</ThemedText>
          </View>
        );
      })}
      <TextInput
        value={value}
        onChangeText={(t) => {
          const next = normalizeCode(t).slice(0, CODE_LENGTH);
          onChange(next);
          // All digits in: put the keyboard away so the Join button is in view.
          if (next.length === CODE_LENGTH) Keyboard.dismiss();
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmit}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="off"
        caretHidden
        // Room for a pasted "482 193".
        maxLength={CODE_LENGTH + 2}
        returnKeyType="go"
        accessibilityLabel="Group code"
        style={styles.hiddenInput}
      />
    </View>
  );
}

/** Hero artwork: a few riders, one of them leading. */
function RiderCluster() {
  const colors = ['#2563EB', '#16A34A', '#7C3AED'];
  return (
    <View style={styles.cluster}>
      <View style={[styles.clusterDot, styles.clusterLeader]}>
        <Icon name="motorbike" size={22} color="#FFFFFF" />
        <View style={styles.clusterCrown}>
          <Icon name="crown" size={11} color="#7A4E00" />
        </View>
      </View>
      {colors.map((c) => (
        <View key={c} style={[styles.clusterDot, { backgroundColor: c }]}>
          <Icon name="motorbike" size={20} color="#FFFFFF" />
        </View>
      ))}
    </View>
  );
}

function InGroup({ identity }: { identity: RiderIdentity }) {
  const db = useSQLiteContext();
  const theme = useTheme();
  const scheme = useColorScheme();
  const group = useGroupRide();
  const now = useNow();
  const mapRef = useRef<MapView>(null);
  const [me, setMe] = useState<LatLng | null>(null);
  const fitted = useRef(false);

  const riders = ridersOf(group, now);
  const self = riders.find((r) => r.isMe);
  const amLeader = group.leader === group.me;
  const code = group.code ?? '';
  const on = { color: theme.onAccent };

  // Share our position while this screen is open (a ride shares it from the Ride screen).
  useFocusEffect(
    useCallback(() => {
      let sub: Location.LocationSubscription | null = null;
      let cancelled = false;
      (async () => {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted || cancelled) return;
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 5 },
          (loc) => {
            const point = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            setMe(point);
            reportGroupPosition(point, loc.coords.speed ?? 0, loc.coords.heading ?? null);
          },
        );
        if (cancelled) sub.remove();
      })();
      return () => {
        cancelled = true;
        sub?.remove();
      };
    }, []),
  );

  const dest = group.destination;
  const live = riders.filter((r) => r.isMe || !r.stale).length;
  const leaderName = riders.find((r) => r.isLeader)?.name;
  const points = riders.flatMap((r) => (r.position && !r.isMe ? [r.position] : []));
  const allPoints = [...points, ...(me ? [me] : []), ...(dest ? [dest] : [])];

  const chooseDestination = () => router.push({ pathname: '/navigate', params: { purpose: 'group' } });
  const clearDestination = () =>
    Alert.alert('Remove destination?', 'Riders will no longer get directions to it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => setGroupDestination(null).catch((e) => Alert.alert('Could not remove', e.message)),
      },
    ]);

  // The ride picks up the group's destination itself (and follows it if the leader changes it),
  // so every rider gets turn-by-turn directions from wherever they are.
  const startRiding = () => router.push('/ride');

  const fitAll = (animated = true) => {
    if (allPoints.length === 0) return;
    mapRef.current?.fitToCoordinates(allPoints, {
      edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
      animated,
    });
  };

  const share = () => {
    const link = Linking.createURL(`join/${code}`);
    Share.share({
      message:
        `Join my group ride on Yatri!\n\nCode: ${formatCode(code)}\n` +
        (dest ? `Riding to: ${dest.name}\n` : '') +
        '\n' +
        `Open Yatri → Group ride → Join and enter the code, or tap this link on your phone:\n${link}`,
    });
  };

  const leave = () => {
    if (group.ended) {
      leaveGroup(db);
      return;
    }
    const others = riders.filter((r) => !r.isMe).length;
    if (amLeader && others > 0) {
      Alert.alert('Leave the group?', 'You can hand the lead to the next rider, or end the ride for everyone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End for everyone', style: 'destructive', onPress: () => leaveGroup(db, { endForEveryone: true }) },
        { text: 'Leave, hand over lead', onPress: () => leaveGroup(db) },
      ]);
    } else {
      Alert.alert('Leave the group?', 'Your friends will stop seeing you on the map.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => leaveGroup(db) },
      ]);
    }
  };

  // The rider whose card is open. Looked up fresh each render so it shows live speed/nickname.
  const [sheetUid, setSheetUid] = useState<string | null>(null);
  const sheetRider = sheetUid ? riders.find((r) => r.uid === sheetUid) : undefined;

  const showOnMap = (rider: Rider) => {
    if (rider.position) mapRef.current?.animateCamera({ center: rider.position, zoom: 16 }, { duration: 500 });
  };

  const onRiderPress = (rider: Rider) => {
    showOnMap(rider);
    if (!group.ended) setSheetUid(rider.uid);
  };

  return (
    <>
      {group.ended ? (
        <View style={[styles.banner, { backgroundColor: theme.warningSoft }]}>
          <Icon name="flag-checkered" size={20} themeColor="warning" />
          <ThemedText type="smallBold" style={styles.flex}>
            The leader ended this group ride.
          </ThemedText>
        </View>
      ) : !group.connected ? (
        <View style={[styles.banner, { backgroundColor: theme.dangerSoft }]}>
          <Icon name="wifi-off" size={20} themeColor="danger" />
          <ThemedText type="smallBold" style={styles.flex}>
            Offline. Positions will update when you&apos;re back online.
          </ThemedText>
        </View>
      ) : null}

      {/* Header: the code to share, who's live, who leads. */}
      <GradientSurface style={styles.hero}>
        <View style={styles.codeRow}>
          <View style={styles.flex}>
            <ThemedText style={[styles.heroCaption, on]}>GROUP CODE</ThemedText>
            <ThemedText style={[styles.code, on]} selectable>
              {formatCode(code)}
            </ThemedText>
          </View>
          <Pressable
            onPress={share}
            disabled={group.ended}
            accessibilityRole="button"
            accessibilityLabel="Invite friends"
            style={({ pressed }) => [styles.inviteButton, pressed && styles.pressedScale, group.ended && styles.dim]}>
            <Icon name="share-variant" size={18} themeColor="accent" />
            <ThemedText type="smallBold" themeColor="accent">
              Invite
            </ThemedText>
          </Pressable>
        </View>
        <View style={[styles.heroRule, { backgroundColor: theme.onAccent }]} />
        <View style={styles.row}>
          <View style={styles.faces}>
            {riders.slice(0, 5).map((r, i) => (
              <View key={r.uid} style={[styles.faceSlot, { zIndex: 10 - i, marginLeft: i === 0 ? 0 : -10 }]}>
                <AvatarFor rider={r} identity={identity} size={34} ring="#FFFFFF" myColor={theme.accentDeep} plain />
              </View>
            ))}
            {riders.length > 5 ? (
              <View style={[styles.face, styles.moreFace]}>
                <ThemedText style={styles.moreText}>+{riders.length - 5}</ThemedText>
              </View>
            ) : null}
          </View>
          <View style={styles.flex}>
            <View style={styles.liveRow}>
              <View style={[styles.liveDot, !group.connected && { backgroundColor: STALE_COLOR }]} />
              <ThemedText type="smallBold" style={on}>
                {live} of {riders.length} live
              </ThemedText>
            </View>
            {leaderName ? (
              <ThemedText type="small" style={[on, styles.soft]} numberOfLines={1}>
                Led by {amLeader ? 'you' : leaderName}
              </ThemedText>
            ) : null}
          </View>
        </View>
      </GradientSurface>

      {/* Destination: set by the leader, seen by everyone. */}
      {dest ? (
        <Card>
          <View style={styles.row}>
            <View style={[styles.destIcon, { backgroundColor: theme.accent }]}>
              <Icon name="flag-checkered" size={20} color={theme.onAccent} />
            </View>
            <View style={styles.flex}>
              <ThemedText type="caption" themeColor="textMuted">
                Riding to
              </ThemedText>
              <ThemedText type="smallBold" numberOfLines={1}>
                {dest.name}
              </ThemedText>
              {me ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {formatAway(distanceMeters(me, dest))} from you
                </ThemedText>
              ) : null}
            </View>
            {amLeader && !group.ended ? (
              <View style={styles.destActions}>
                <Pressable onPress={chooseDestination} hitSlop={8} accessibilityRole="button" accessibilityLabel="Change destination">
                  <ThemedText type="smallBold" themeColor="accent">
                    Change
                  </ThemedText>
                </Pressable>
                <Pressable onPress={clearDestination} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove destination">
                  <Icon name="close" size={20} themeColor="textMuted" />
                </Pressable>
              </View>
            ) : null}
          </View>
        </Card>
      ) : amLeader && !group.ended ? (
        <Pressable
          onPress={chooseDestination}
          accessibilityRole="button"
          accessibilityLabel="Set a destination"
          style={({ pressed }) => [
            styles.destEmpty,
            { borderColor: theme.accent, backgroundColor: theme.accentSoft },
            pressed && styles.pressed,
          ]}>
          <View style={[styles.destIcon, { backgroundColor: theme.accent }]}>
            <Icon name="map-marker-plus" size={20} color={theme.onAccent} />
          </View>
          <View style={styles.flex}>
            <ThemedText type="smallBold">Set a destination</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Everyone sees it and gets directions there.
            </ThemedText>
          </View>
          <Icon name="chevron-right" size={20} themeColor="accent" />
        </Pressable>
      ) : !group.ended ? (
        <View style={[styles.destNote, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Icon name="flag-outline" size={18} themeColor="textMuted" />
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            No destination yet. The leader can set one.
          </ThemedText>
        </View>
      ) : null}

      <View style={[styles.mapBox, { borderColor: theme.border }]}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          showsUserLocation={!me}
          showsMyLocationButton={false}
          toolbarEnabled={false}
          showsPointsOfInterests={false}
          userInterfaceStyle={scheme === 'dark' ? 'dark' : 'light'}
          onMapReady={() => fitAll(false)}
          onUserLocationChange={() => {
            // Frame everyone once, as soon as we know where we are.
            if (!fitted.current && allPoints.length > 0) {
              fitted.current = true;
              fitAll();
            }
          }}>
          {riders
            .filter((r) => !r.isMe)
            .map((r) => (
              <RiderMarker
                key={riderMarkerKey(r)}
                rider={r}
                description={riderStatus(r, me, now)}
                onPress={group.ended ? undefined : () => setSheetUid(r.uid)}
              />
            ))}
          {dest ? <Marker coordinate={dest} title={dest.name} description="Group destination" pinColor={theme.accent} /> : null}
          {me ? (
            <MeMarker
              key={`me-${theme.accent}-${identity.name}-${myLook(self, identity).avatar}-${myLook(self, identity).photo}`}
              position={me}
              name={self?.name ?? identity.name}
              avatar={myLook(self, identity).avatar}
              photo={myLook(self, identity).photo}
              color={theme.accent}
              onPress={group.me && !group.ended ? () => setSheetUid(group.me) : undefined}
            />
          ) : null}
        </MapView>
        <Pressable
          onPress={() => fitAll()}
          accessibilityLabel="Show everyone"
          style={[styles.fitButton, { backgroundColor: theme.backgroundElement }]}>
          <Icon name="fit-to-screen-outline" size={22} themeColor="accent" />
        </Pressable>
      </View>

      <Card>
        <View style={styles.ridersHead}>
          <ThemedText type="heading">Riders</ThemedText>
          <View style={[styles.countPill, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {riders.length}/{MAX_RIDERS}
            </ThemedText>
          </View>
        </View>
        {riders.map((r, i) => {
          const status = r.isMe ? (me ? 'Sharing your location' : 'Finding your location…') : riderStatus(r, me, now);
          const moving = !r.isMe && !!r.position && !r.stale;
          return (
            <View key={r.uid} style={styles.riderBlock}>
              {i > 0 ? <Divider /> : null}
              <Pressable onPress={() => onRiderPress(r)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <View>
                  <AvatarFor rider={r} identity={identity} size={44} myColor={theme.accent} />
                  <View
                    style={[
                      styles.presence,
                      { borderColor: theme.backgroundElement, backgroundColor: r.isMe || !r.stale ? '#22C55E' : STALE_COLOR },
                    ]}
                  />
                </View>
                <View style={styles.flex}>
                  <View style={styles.nameRow}>
                    <ThemedText type="smallBold" numberOfLines={1} style={styles.shrink}>
                      {r.name}
                    </ThemedText>
                    {r.isMe ? <Tag label="You" color={theme.textSecondary} background={theme.backgroundSelected} /> : null}
                    {r.isLeader ? <Tag label="Leader" color="#7A4E00" background="#FDE68A" /> : null}
                  </View>
                  {r.nickname || r.bike ? (
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {[r.nickname ? r.realName : null, r.bike].filter(Boolean).join(' · ')}
                    </ThemedText>
                  ) : null}
                  <ThemedText type="small" themeColor={r.stale && !r.isMe ? 'textMuted' : 'textSecondary'} numberOfLines={1}>
                    {moving && r.position
                      ? me
                        ? `${formatAway(distanceMeters(me, r.position))} away`
                        : 'Live'
                      : status}
                  </ThemedText>
                </View>
                {moving ? (
                  <View style={styles.speed}>
                    <ThemedText style={styles.speedValue}>{r.speedKmh}</ThemedText>
                    <ThemedText type="caption" themeColor="textMuted">
                      km/h
                    </ThemedText>
                  </View>
                ) : null}
              </Pressable>
            </View>
          );
        })}
        {riders.length === 0 ? <ActivityIndicator color={theme.accent} /> : null}
        {riders.length === 1 && !group.ended ? (
          <Pressable onPress={share} style={[styles.waiting, { backgroundColor: theme.background }]}>
            <Icon name="account-plus-outline" size={20} themeColor="accent" />
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              Waiting for friends. Tap to send them the code.
            </ThemedText>
          </Pressable>
        ) : null}
      </Card>

      {!group.ended ? (
        <Button
          title={dest ? 'Start riding there' : 'Start riding'}
          icon={dest ? 'navigation-variant' : 'play'}
          large
          onPress={startRiding}
        />
      ) : null}
      <Pressable onPress={leave} accessibilityRole="button" style={({ pressed }) => [styles.leave, pressed && styles.pressed]}>
        <Icon name="exit-run" size={18} color={group.ended ? theme.text : theme.danger} />
        <ThemedText type="smallBold" style={{ color: group.ended ? theme.text : theme.danger }}>
          {group.ended ? 'Close group' : amLeader ? 'Leave or end group' : 'Leave group'}
        </ThemedText>
      </Pressable>
      <View style={styles.privacy}>
        <Icon name="lock-outline" size={14} themeColor="textMuted" />
        <ThemedText type="small" themeColor="textMuted" style={styles.flex}>
          Only this group sees your location, and only while this screen is open or a ride is recording.
        </ThemedText>
      </View>

      {sheetRider ? (
        <RiderSheet
          // Fresh nickname field per rider.
          key={sheetRider.uid}
          rider={sheetRider}
          identity={identity}
          me={me}
          now={now}
          canMakeLeader={amLeader && !sheetRider.isMe}
          onClose={() => setSheetUid(null)}
          onShowOnMap={() => {
            showOnMap(sheetRider);
            setSheetUid(null);
          }}
        />
      ) : null}
    </>
  );
}

function Tag({ label, color, background }: { label: string; color: string; background: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: background }]}>
      <ThemedText style={[styles.tagText, { color }]}>{label}</ThemedText>
    </View>
  );
}

/** Your own avatar, straight from this phone (no need to wait for the group to send it back). */
function MyAvatar({ identity, color, size, ring }: { identity: RiderIdentity; color: string; size: number; ring?: string }) {
  return (
    <RiderAvatar
      name={identity.name}
      avatar={identity.avatar}
      photo={identity.avatar === 'photo' ? identity.photoUri : null}
      color={color}
      size={size}
      ring={ring}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  flex: {
    flex: 1,
  },
  center: {
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  pressedScale: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hero: {
    padding: 20,
    gap: Spacing.three,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ADE80',
  },
  liveText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  heroText: {
    gap: Spacing.one,
  },
  heroTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 21,
    opacity: 0.92,
  },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.medium,
    paddingVertical: 15,
    marginTop: Spacing.one,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  heroButtonText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
  },
  heroHint: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    opacity: 0.8,
    marginTop: -Spacing.one,
  },
  cluster: {
    flexDirection: 'row',
  },
  clusterDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -12,
  },
  clusterLeader: {
    backgroundColor: '#1F2937',
    borderColor: '#FACC15',
    zIndex: 1,
  },
  clusterCrown: {
    position: 'absolute',
    top: -8,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FACC15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  joinIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxes: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  box: {
    flex: 1,
    aspectRatio: 0.82,
    maxHeight: 64,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChar: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.02,
    color: 'transparent',
    fontSize: 1,
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radius.medium,
    paddingVertical: 14,
  },
  joinText: {
    fontSize: 16,
    lineHeight: 22,
  },
  steps: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  step: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: 12,
    borderRadius: Radius.medium,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  code: {
    fontSize: 36,
    lineHeight: 44,
    fontWeight: '800',
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
  },
  heroCaption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.5,
    opacity: 0.8,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.pill,
  },
  dim: {
    opacity: 0.5,
  },
  heroRule: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.3,
  },
  faces: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  faceSlot: {
    borderRadius: 17,
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    padding: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    marginTop: -Spacing.one,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  nickField: {
    gap: Spacing.two,
  },
  nickBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: 12,
  },
  nickInput: {
    flex: 1,
    fontSize: 17,
    paddingVertical: 12,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  sheetAction: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: Radius.medium,
  },
  face: {
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  moreFace: {
    width: 34,
    height: 34,
    marginLeft: -10,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  soft: {
    opacity: 0.85,
  },
  destIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  destEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  destNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: 12,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
  },
  ridersHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  presence: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shrink: {
    flexShrink: 1,
  },
  tag: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: Radius.pill,
  },
  tagText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
  },
  speedValue: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: 12,
    borderRadius: Radius.medium,
  },
  leave: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: 12,
  },
  privacy: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: Spacing.two,
  },
  mapBox: {
    height: 300,
    borderRadius: Radius.large,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  fitButton: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  riderBlock: {
    gap: Spacing.two,
  },
  dot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    lineHeight: 20,
  },
  crown: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FACC15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speed: {
    alignItems: 'flex-end',
  },
});
