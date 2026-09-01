import { Image } from "expo-image";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { radius as R, theme } from "@/lib/theme";

/**
 * Gem image with a decorative fallback. When there's no ready photo we draw a
 * faceted diamond from layered rotated squares — a real motif rather than a
 * bare glyph, so empty listings still look intentional.
 */
export function GemThumb({
  uri,
  size,
  fill,
  radius = R.md,
  diamond = 26,
}: {
  uri?: string | null;
  /** Fixed square side. Ignored when `fill` is set. */
  size?: number;
  /** Fill the parent (used for the hero). */
  fill?: boolean;
  radius?: number;
  /** Side length of the diamond motif. */
  diamond?: number;
}): React.ReactElement {
  const box: ViewStyle = fill
    ? { width: "100%", height: "100%", borderRadius: radius }
    : { width: size, height: size, borderRadius: radius };

  if (uri) {
    return (
      <View style={[styles.wrap, box]}>
        <Image source={{ uri }} style={styles.img} contentFit="cover" transition={200} />
      </View>
    );
  }

  const inner = diamond * 0.52;
  return (
    <View style={[styles.wrap, styles.placeholder, box]}>
      <View
        style={[styles.diamond, { width: diamond, height: diamond, borderRadius: diamond * 0.18 }]}
      >
        <View
          style={[styles.diamondInner, { width: inner, height: inner, borderRadius: inner * 0.18 }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden", backgroundColor: theme.bgElev },
  img: { width: "100%", height: "100%" },
  placeholder: { alignItems: "center", justifyContent: "center" },
  diamond: {
    transform: [{ rotate: "45deg" }],
    borderWidth: 1.5,
    borderColor: theme.gold,
    backgroundColor: "rgba(232,195,122,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  diamondInner: {
    borderWidth: 1,
    borderColor: "rgba(232,195,122,0.55)",
    backgroundColor: "rgba(232,195,122,0.12)",
  },
});
