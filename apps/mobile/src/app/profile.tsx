import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { GemApiError, useAuth } from "@/lib/auth";
import { radius, space, theme } from "@/lib/theme";

export default function ProfileScreen(): React.ReactElement {
  const router = useRouter();
  const { user, logout, deleteAccount } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSignOut(): Promise<void> {
    await logout();
    router.replace("/");
  }

  async function onDelete(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      await deleteAccount(password);
      router.replace("/");
    } catch (err) {
      setError(
        err instanceof GemApiError && err.code === "INVALID_CREDENTIALS"
          ? "Incorrect password."
          : "Couldn’t delete your account. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.name?.trim()[0] ?? "?").toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user?.name ?? "—"}</Text>
          <Text style={styles.email}>{user?.email ?? ""}</Text>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
        onPress={() => router.push("/my-listings")}
      >
        <Text style={styles.secondaryText}>My listings</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
        onPress={() => router.push("/my-bids")}
      >
        <Text style={styles.secondaryText}>My bids</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
        onPress={() => void onSignOut()}
      >
        <Text style={styles.secondaryText}>Sign out</Text>
      </Pressable>

      <Text style={styles.dangerHeading}>Danger zone</Text>
      <View style={styles.dangerCard}>
        <Text style={styles.dangerTitle}>Delete account</Text>
        <Text style={styles.dangerBody}>
          This permanently removes your personal data and signs you out everywhere. Your past bids
          stay on record as “Deleted user”. This can’t be undone.
        </Text>

        {!confirming ? (
          <Pressable
            style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressed]}
            onPress={() => setConfirming(true)}
          >
            <Text style={styles.dangerBtnText}>Delete account</Text>
          </Pressable>
        ) : (
          <View>
            <Text style={styles.label}>Confirm your password to continue</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={theme.faint}
              autoFocus
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.confirmRow}>
              <Pressable
                style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
                onPress={() => {
                  setConfirming(false);
                  setPassword("");
                  setError(null);
                }}
                disabled={busy}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.dangerBtn,
                  { flex: 1 },
                  (busy || password.length === 0) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                onPress={() => void onDelete()}
                disabled={busy || password.length === 0}
              >
                <Text style={styles.dangerBtnText}>
                  {busy ? "Deleting…" : "Permanently delete"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: space.lg, gap: space.lg },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: theme.ink, fontSize: 22, fontWeight: "900" },
  name: { color: theme.text, fontSize: 18, fontWeight: "800" },
  email: { color: theme.muted, fontSize: 14, marginTop: 2 },
  secondaryBtn: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    alignItems: "center",
  },
  secondaryText: { color: theme.text, fontWeight: "800", fontSize: 15 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  dangerHeading: {
    color: theme.faint,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: space.sm,
  },
  dangerCard: {
    backgroundColor: "rgba(255,107,107,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,107,107,0.35)",
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  dangerTitle: { color: theme.danger, fontSize: 16, fontWeight: "800" },
  dangerBody: { color: theme.muted, fontSize: 13, lineHeight: 19 },
  label: { color: theme.muted, fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: theme.bgElev,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: radius.md,
    color: theme.text,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    fontSize: 16,
  },
  error: { color: theme.danger, marginTop: space.sm, fontSize: 14 },
  confirmRow: { flexDirection: "row", gap: space.md, marginTop: space.md },
  cancelBtn: {
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    paddingHorizontal: space.lg,
    alignItems: "center",
  },
  cancelText: { color: theme.text, fontWeight: "700", fontSize: 15 },
  dangerBtn: {
    backgroundColor: theme.danger,
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    alignItems: "center",
  },
  dangerBtnText: { color: "#2a0a0a", fontWeight: "900", fontSize: 15 },
});
