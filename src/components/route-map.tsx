import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { regionFor, type LatLng } from '@/lib/geo';

/**
 * A finished ride on a real map. Static by default (for cards); pass `interactive`
 * to let the rider pan and zoom.
 */
export function RouteMap({
  route,
  height = 200,
  interactive = false,
  style,
}: {
  route: LatLng[];
  height?: number;
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const region = regionFor(route);

  if (!region) {
    return <View style={[styles.box, { height, backgroundColor: theme.backgroundSelected }, style]} />;
  }

  return (
    <View style={[styles.box, { height }, style]} pointerEvents={interactive ? 'auto' : 'none'}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        userInterfaceStyle={scheme === 'dark' ? 'dark' : 'light'}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsPointsOfInterests={false}
        liteMode={!interactive}>
        <Polyline coordinates={route} strokeColor={theme.accent} strokeWidth={4} lineJoin="round" lineCap="round" />
        <Marker coordinate={route[0]} pinColor={theme.success} title="Start" />
        <Marker coordinate={route.at(-1)!} pinColor={theme.accent} title="End" />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: Radius.medium,
    overflow: 'hidden',
  },
});
