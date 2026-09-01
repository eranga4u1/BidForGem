import { StyleSheet, Text, View } from "react-native";
import { radius, space, statusStyle } from "@/lib/theme";

/** Small colored pill conveying an auction's status (Live / Sold / Ended …). */
export function StatusPill({
  status,
  label,
}: {
  status: string;
  /** Override the default status label (e.g. force "Live"). */
  label?: string;
}): React.ReactElement {
  const s = statusStyle(status);
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      {status === "active" && <View style={[styles.dot, { backgroundColor: s.fg }]} />}
      <Text style={[styles.text, { color: s.fg }]}>{label ?? s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
});
