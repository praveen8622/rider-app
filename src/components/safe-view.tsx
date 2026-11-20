import { StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

/**
 * Drop-in for SafeAreaView in full-screen modals. SafeAreaView measures itself natively,
 * and inside a freshly opened iOS fullScreenModal that first measurement is 0, so content
 * jumped under the status bar on the first open after launch. The insets from the root
 * provider are right from the first frame. Insets are added to any padding in `style`.
 */
export function SafeView({
  edges = ['top', 'right', 'bottom', 'left'],
  style,
  ...rest
}: ViewProps & { edges?: Edge[] }) {
  const insets = useSafeAreaInsets();
  const s = StyleSheet.flatten(style) ?? {};
  const base = (side: 'Top' | 'Bottom' | 'Left' | 'Right') => {
    const axis = side === 'Top' || side === 'Bottom' ? s.paddingVertical : s.paddingHorizontal;
    const value = s[`padding${side}`] ?? axis ?? s.padding ?? 0;
    return typeof value === 'number' ? value : 0;
  };

  return (
    <View
      style={[
        style,
        {
          paddingTop: base('Top') + (edges.includes('top') ? insets.top : 0),
          paddingBottom: base('Bottom') + (edges.includes('bottom') ? insets.bottom : 0),
          paddingLeft: base('Left') + (edges.includes('left') ? insets.left : 0),
          paddingRight: base('Right') + (edges.includes('right') ? insets.right : 0),
        },
      ]}
      {...rest}
    />
  );
}
