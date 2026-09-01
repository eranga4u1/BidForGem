import { useEffect, useRef } from "react";
import { Animated, StyleSheet, type ViewStyle } from "react-native";
import { radius, theme } from "@/lib/theme";

/**
 * A pulsing placeholder block. Uses the core Animated API (no extra deps) to
 * loop opacity, giving a lightweight "shimmer" while content loads.
 */
export function Skeleton({
  width,
  height,
  radius: r = radius.sm,
  style,
}: {
  width?: number | `${number}%`;
  height: number;
  radius?: number;
  style?: ViewStyle;
}): React.ReactElement {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        styles.base,
        { height, borderRadius: r, opacity: pulse },
        width !== undefined ? { width } : { alignSelf: "stretch" },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: theme.bgElev },
});
