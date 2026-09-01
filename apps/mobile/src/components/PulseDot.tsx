import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

/** A dot with an outward pulsing halo — the "connected / live" indicator. */
export function PulseDot({ color, on }: { color: string; on: boolean }): React.ReactElement {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!on) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [on, pulse]);

  return (
    <View style={styles.wrap}>
      {on ? (
        <Animated.View
          style={[
            styles.halo,
            {
              backgroundColor: color,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
              transform: [
                { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) },
              ],
            },
          ]}
        />
      ) : null}
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 10, height: 10, alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute", width: 10, height: 10, borderRadius: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
