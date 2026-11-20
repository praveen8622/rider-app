import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { RiderAvatar } from '@/components/rider-avatar';
import { distanceMeters, type LatLng } from '@/lib/geo';
import { STALE_COLOR, type Rider } from '@/lib/group-ride';

export function timeAgoShort(t: number, now: number) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : 'over a day ago';
}

export function formatAway(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

/** "42 km/h · 1.2 km away", or "Last seen 5 min ago" when their phone has gone quiet. */
export function riderStatus(rider: Rider, me: LatLng | null, now: number) {
  if (!rider.position || rider.seenAt == null) return 'Waiting for GPS';
  if (rider.stale) return `Last seen ${timeAgoShort(rider.seenAt, now)}`;
  const away = me && !rider.isMe ? ` · ${formatAway(distanceMeters(me, rider.position))} away` : '';
  return `${rider.speedKmh} km/h${away}`;
}

/** iPhone (Apple Maps) reports taps on custom-drawn markers as a selection; Android as a press. */
const iosSelect = (onPress?: () => void) => (Platform.OS === 'ios' ? onPress : undefined);

/**
 * A friend on the map: their avatar in a circle, a gold ring and crown for the leader,
 * grey when their position is old. Pass a `key` that changes with the look (see
 * riderMarkerKey) so the marker re-renders its picture; only the position moves otherwise.
 */
export function RiderMarker({
  rider,
  description,
  onPress,
}: {
  rider: Rider;
  description: string;
  /** Open the rider card instead of the map's small label bubble. */
  onPress?: () => void;
}) {
  // Android draws a custom marker into a bitmap; tracking changes forever is slow,
  // so track just long enough for the first draw.
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTracks(false), 800);
    return () => clearTimeout(t);
  }, []);

  if (!rider.position) return null;
  return (
    <Marker
      coordinate={rider.position}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      title={onPress ? undefined : rider.isLeader ? `${rider.name} (leader)` : rider.name}
      description={onPress ? undefined : description}
      onPress={onPress}
      onSelect={iosSelect(onPress)}
      zIndex={rider.isLeader ? 3 : rider.stale ? 1 : 2}>
      {/* The drawing must not take touches itself, or on iPhone the marker never hears the tap. */}
      <View style={styles.wrap} pointerEvents="none">
        <RiderAvatar
          name={rider.name}
          avatar={rider.avatar}
          photo={rider.photo}
          color={rider.stale ? STALE_COLOR : rider.color}
          stale={rider.stale}
          leader={rider.isLeader}
          ring="#FFFFFF"
          size={40}
        />
      </View>
    </Marker>
  );
}

/** A marker's look changes with these; use as its `key` so the picture is redrawn. */
export function riderMarkerKey(r: Rider) {
  return [r.uid, r.color, r.isLeader, r.stale, r.name, r.avatar, r.photo?.length ?? 0].join('-');
}

/**
 * You, drawn like your friends see each other (your avatar in a circle), in your accent color
 * with a soft halo so you can find yourself at a glance. Replaces the platform's blue dot.
 */
export function MeMarker({
  position,
  name,
  avatar,
  photo,
  color,
  onPress,
}: {
  position: LatLng;
  name: string;
  avatar?: string | null;
  photo?: string | null;
  color: string;
  onPress?: () => void;
}) {
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTracks(false), 800);
    return () => clearTimeout(t);
  }, []);
  return (
    <Marker
      coordinate={position}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      title={onPress ? undefined : 'You'}
      onPress={onPress}
      onSelect={iosSelect(onPress)}
      zIndex={4}>
      <View style={styles.meWrap} pointerEvents="none">
        <View style={[styles.halo, { backgroundColor: color }]} />
        <RiderAvatar name={name || 'Me'} avatar={avatar} photo={photo} color={color} ring="#FFFFFF" size={40} />
      </View>
    </Marker>
  );
}

/** Top-down rider on a bike, facing up (north), 64 x 100. Jacket takes the accent colour. */
function TopRider({ jacket, width }: { jacket: string; width: number }) {
  return (
    <Svg width={width} height={(width * 100) / 64} viewBox="0 0 64 100">
      {/* Soft shadow under the bike */}
      <Ellipse cx="33" cy="53" rx="17" ry="42" fill="rgba(0,0,0,0.18)" />
      {/* Tyres */}
      <Rect x="27" y="3" width="10" height="20" rx="5" fill="#1F2328" />
      <Rect x="27" y="77" width="10" height="20" rx="5" fill="#1F2328" />
      {/* Body / seat */}
      <Rect x="21" y="13" width="22" height="74" rx="11" fill="#6B7280" />
      <Rect x="28" y="16" width="8" height="66" rx="4" fill="#9CA3AF" />
      <Rect x="26" y="85" width="12" height="4" rx="2" fill="#EF4444" />
      {/* Handlebar and gloves */}
      <Rect x="7" y="23" width="50" height="5" rx="2.5" fill="#374151" />
      {/* Arms (jacket) */}
      <Path d="M23 47 L12 27 M41 47 L52 27" stroke={jacket} strokeWidth={8} strokeLinecap="round" />
      <Circle cx="11" cy="25.5" r="5" fill="#F59E0B" />
      <Circle cx="53" cy="25.5" r="5" fill="#F59E0B" />
      {/* Torso (jacket) */}
      <Ellipse cx="32" cy="52" rx="14" ry="12" fill={jacket} />
      {/* Helmet, with the visor towards the front */}
      <Circle cx="32" cy="41" r="10" fill="#4B5563" />
      <Path d="M24.5 37 A10 10 0 0 1 39.5 37 L37 39 A7 7 0 0 0 27 39 Z" fill="#111827" />
      <Circle cx="29" cy="43" r="3" fill="#FFFFFF" opacity={0.35} />
    </Svg>
  );
}

/**
 * You while riding: a rider on a bike seen from above, turned to your direction of travel.
 * `heading` is the compass direction you're going; `mapHeading` is how far the map is turned
 * (0 = north up), so the bike points the right way on screen in either map mode.
 */
export function RidingMarker({
  position,
  heading,
  mapHeading,
  color,
  size = 34,
  onPress,
}: {
  position: LatLng;
  heading: number | null;
  mapHeading: number;
  color: string;
  size?: number;
  onPress?: () => void;
}) {
  // The ride keeps the last direction while you're stopped, so the bike doesn't snap north.
  const angle = ((((heading ?? 0) - mapHeading) % 360) + 360) % 360;
  const box = (size * 100) / 64;

  return (
    <Marker
      coordinate={position}
      anchor={{ x: 0.5, y: 0.5 }}
      // The picture turns with every heading change, so it must keep redrawing.
      tracksViewChanges
      onPress={onPress}
      onSelect={iosSelect(onPress)}
      zIndex={4}>
      <View pointerEvents="none" style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ transform: [{ rotate: `${angle}deg` }] }}>
          <TopRider jacket={color} width={size} />
        </View>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  meWrap: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    opacity: 0.2,
  },
  wrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
