import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, space, theme } from "@/lib/theme";

/**
 * Centered empty / error placeholder: a diamond emblem, a headline, an optional
 * subtitle, and an optional action button. One component for "nothing here yet"
 * and "something went wrong".
 */
export function EmptyState({
  title,
  subtitle,
  actionLabel,
  onAction,
  tone = "muted",
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "muted" | "error";
}): React.ReactElement {
  const emblem = tone === "error" ? theme.danger : theme.gold;
  return (
    <View style={styles.wrap}>
      <View style={[styles.emblem, { borderColor: emblem }]}>
        <View style={[styles.emblemInner, { backgroundColor: emblem }]} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          onPress={onAction}
        >
          <Text style={styles.btnText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    gap: space.md,
  },
  emblem: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    transform: [{ rotate: "45deg" }],
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.85,
    marginBottom: space.xs,
  },
  emblemInner: { width: 20, height: 20, borderRadius: 6, opacity: 0.35 },
  title: { color: theme.text, fontSize: 17, fontWeight: "800", textAlign: "center" },
  subtitle: {
    color: theme.muted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
  btn: {
    marginTop: space.sm,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    backgroundColor: theme.card,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
  },
  btnPressed: { opacity: 0.6 },
  btnText: { color: theme.text, fontWeight: "800", fontSize: 14 },
});
