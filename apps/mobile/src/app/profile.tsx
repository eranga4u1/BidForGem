import { phoneSchema } from "@gem/contracts";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { GemApiError, useAuth } from "@/lib/auth";
import { radius, space, theme } from "@/lib/theme";

/** Same rule the API enforces; blank is allowed (the field is optional). */
function isValidPhone(value: string): boolean {
  return !value.trim() || phoneSchema.safeParse(value).success;
}

export default function ProfileScreen(): React.ReactElement {
  const router = useRouter();
  const { user, logout, deleteAccount, updateProfile } = useAuth();
  const [phone, setPhone] = useState("");
  const [phone2, setPhone2] = useState("");
  const [saving, setSaving] = useState(false);
  const [contactMsg, setContactMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Prefill with the saved numbers (and re-sync after each save).
  useEffect(() => {
    setPhone(user?.phone ?? "");
    setPhone2(user?.phone2 ?? "");
  }, [user]);

  async function onSaveContact(): Promise<void> {
    if (!user) return;
    if (!isValidPhone(phone) || !isValidPhone(phone2)) {
      setContactMsg({ ok: false, text: "Use a number like 077 123 4567 or +94 77 123 4567." });
      return;
    }
    setContactMsg(null);
    setSaving(true);
    try {
      await updateProfile({ name: user.name, phone: phone.trim(), phone2: phone2.trim() });
      setContactMsg({ ok: true, text: "Contact numbers saved." });
    } catch {
      setContactMsg({ ok: false, text: "Couldn’t save your numbers. Please try again." });
    } finally {
      setSaving(false);
    }
  }
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

      <View style={styles.contactCard}>
        <Text style={styles.contactTitle}>Contact numbers</Text>
        <Text style={styles.contactHint}>
          Signed-in buyers see these on your listings. You need at least one to sell.
        </Text>
        <Text style={styles.label}>Contact number</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder="077 123 4567"
          placeholderTextColor={theme.faint}
        />
        <Text style={[styles.label, { marginTop: space.md }]}>Second number (optional)</Text>
        <TextInput
          style={styles.input}
          value={phone2}
          onChangeText={setPhone2}
          keyboardType="phone-pad"
          placeholder="WhatsApp or land line"
          placeholderTextColor={theme.faint}
        />
        {contactMsg ? (
          <Text style={contactMsg.ok ? styles.success : styles.error}>{contactMsg.text}</Text>
        ) : null}
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            saving && styles.disabled,
            pressed && !saving && styles.pressed,
          ]}
          onPress={() => void onSaveContact()}
          disabled={saving}
        >
          <Text style={styles.primaryText}>{saving ? "Saving…" : "Save numbers"}</Text>
        </Pressable>
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
  success: { color: theme.brand, marginTop: space.sm, fontSize: 14 },
  contactCard: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  contactTitle: { color: theme.text, fontSize: 16, fontWeight: "800" },
  contactHint: { color: theme.muted, fontSize: 13, lineHeight: 19, marginVertical: space.sm },
  primaryBtn: {
    backgroundColor: theme.brand,
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    alignItems: "center",
    marginTop: space.md,
  },
  primaryText: { color: theme.ink, fontWeight: "900", fontSize: 15 },
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
