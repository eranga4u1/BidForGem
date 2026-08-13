import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { GemApiError, useAuth } from "@/lib/auth";
import { authStyles as s } from "@/lib/auth-styles";
import { theme } from "@/lib/theme";

export default function LoginScreen(): React.ReactElement {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.back();
    } catch (err) {
      setError(
        err instanceof GemApiError && err.code === "INVALID_CREDENTIALS"
          ? "Incorrect email or password."
          : "Couldn’t sign in. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.card}>
        <Text style={s.title}>Welcome back</Text>
        <Text style={s.label}>Email</Text>
        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor={theme.faint}
        />
        <Text style={s.label}>Password</Text>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={theme.faint}
        />
        {error && <Text style={s.error}>{error}</Text>}
        <Pressable
          style={[s.btn, busy && s.btnDisabled]}
          onPress={() => void submit()}
          disabled={busy}
        >
          <Text style={s.btnText}>{busy ? "Signing in…" : "Sign in"}</Text>
        </Pressable>
        <Pressable onPress={() => router.replace("/register")}>
          <Text style={s.link}>No account? Create one</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
