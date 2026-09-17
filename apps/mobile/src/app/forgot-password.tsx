import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { api } from "@/lib/api";
import { GemApiError } from "@/lib/auth";
import { authStyles as s } from "@/lib/auth-styles";
import { theme } from "@/lib/theme";

export default function ForgotPasswordScreen(): React.ReactElement {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      await api.auth.forgotPassword(email.trim());
      // The API responds identically whether or not the account exists, so the
      // confirmation is deliberately generic (no account-existence leak).
      setSent(true);
    } catch (err) {
      setError(
        err instanceof GemApiError && err.code === "INVALID_INPUT"
          ? "Enter a valid email address."
          : "Couldn’t send the reset link. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20 }}
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
    >
      <View style={s.card}>
        {sent ? (
          <>
            <Text style={s.title}>Check your email</Text>
            <Text style={s.label}>
              If an account exists for {email.trim()}, we’ve sent a link to reset your password.
              Open it on this device to choose a new one.
            </Text>
            <Pressable style={s.btn} onPress={() => router.replace("/login")}>
              <Text style={s.btnText}>Back to sign in</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={s.title}>Reset your password</Text>
            <Text style={s.label}>
              Enter your account email and we’ll send you a link to set a new password.
            </Text>
            <Text style={s.label}>Email</Text>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={theme.faint}
            />
            {error && <Text style={s.error}>{error}</Text>}
            <Pressable
              style={[s.btn, busy && s.btnDisabled]}
              onPress={() => void submit()}
              disabled={busy || email.trim().length === 0}
            >
              <Text style={s.btnText}>{busy ? "Sending…" : "Send reset link"}</Text>
            </Pressable>
            <Pressable onPress={() => router.replace("/login")}>
              <Text style={s.link}>Back to sign in</Text>
            </Pressable>
          </>
        )}
      </View>
    </KeyboardAwareScrollView>
  );
}
