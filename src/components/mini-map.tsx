import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { Icon } from '@/components/icon';
import { RiderMarker, riderMarkerKey, RidingMarker } from '@/components/rider-marker';
import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import type { LatLng } from '@/lib/geo';
import type { Rider } from '@/lib/group-ride';

/**
 * A small live map for the speedometer view: follows you (heading up), with the route and
 * destination while navigating and group riders when in a group. Tap to open the full map.
 */
export function MiniMap({
  position,
  heading,
  travelHeading,
  route,
  destination,
  friends,
  me,
  label,
  traffic = false,
  onPress,
  style,
}: {
  /** Live traffic colours on the roads. */
  traffic?: boolean;
  position: LatLng | null;
  /** Which way the map turns (0 = north up). */
  heading: number | null;
  /** Which way you're riding, for the bike marker (defaults to `heading`). */
  travelHeading?: number | null;
  route?: LatLng[] | null;
  destination?: (LatLng & { name: string }) | null;
  friends: Rider[];
  me: { name: string; avatar: string | null; photo: string | null; color: string };
  /** Short caption in the corner, e.g. "2.4 km to go". */
  label?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const mapRef = useRef<MapView>(null);

  // Follow the rider; heading-up like the big map, a little zoomed out to see what's ahead.
  useEffect(() => {
    if (!position) return;
    mapRef.current?.animateCamera(
      { center: position, heading: heading ?? 0, pitch: 0, zoom: route ? 16 : 16.5 },
      { duration: 900 },
    );
  }, [position, heading, route]);

  return (
    <View style={[styles.box, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, style]}>
      {/* Not draggable: it's a glance view. The whole card is the button. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialCamera={
            position ? { center: position, heading: heading ?? 0, pitch: 0, zoom: 16.5, altitude: 600 } : undefined
          }
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          showsCompass={false}
          showsMyLocationButton={false}
          showsPointsOfInterests={false}
          showsUserLocation={!position}
          showsTraffic={traffic}
          userInterfaceStyle={scheme === 'dark' ? 'dark' : 'light'}>
          {route && route.length > 1 ? (
            <Polyline coordinates={route} strokeColor={theme.accent} strokeWidth={6} lineJoin="round" lineCap="round" />
          ) : null}
          {destination ? <Marker coordinate={destination} pinColor={theme.accent} /> : null}
          {friends.map((r) => (
            <RiderMarker key={riderMarkerKey(r)} rider={r} description="" />
          ))}
          {position ? (
            <RidingMarker
              position={position}
              heading={travelHeading ?? heading}
              mapHeading={heading ?? 0}
              color={me.color}
              size={26}
            />
          ) : null}
        </MapView>
      </View>

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Open the full map"
        style={({ pressed }) => [StyleSheet.absoluteFill, pressed && styles.pressed]}
      />

      {label ? (
        <View style={[styles.label, { backgroundColor: theme.backgroundElement }]} pointerEvents="none">
          <ThemedText type="smallBold" numberOfLines={1}>
            {label}
          </ThemedText>
        </View>
      ) : null}
      <View style={[styles.expand, { backgroundColor: theme.backgroundElement }]} pointerEvents="none">
        <Icon name="arrow-expand" size={16} themeColor="accent" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  pressed: {
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  label: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    maxWidth: '75%',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  expand: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
});
