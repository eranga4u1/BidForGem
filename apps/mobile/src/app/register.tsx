import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { GemApiError, useAuth } from "@/lib/auth";
import { authStyles as s } from "@/lib/auth-styles";
import { theme } from "@/lib/theme";

export default function RegisterScreen(): React.ReactElement {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      await register(name.trim(), email.trim(), password);
      router.back();
    } catch (err) {
      const detail =
        err instanceof GemApiError && Array.isArray(err.details)
          ? (err.details[0] as { message?: string })?.message
          : undefined;
      setError(detail ?? "Couldn’t create the account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.card}>
        <Text style={s.title}>Create your account</Text>
        <Text style={s.label}>Name</Text>
        <TextInput
          style={s.input}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={theme.faint}
        />
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
          placeholder="At least 8 characters"
          placeholderTextColor={theme.faint}
        />
        {error && <Text style={s.error}>{error}</Text>}
        <Pressable
          style={[s.btn, busy && s.btnDisabled]}
          onPress={() => void submit()}
          disabled={busy}
        >
          <Text style={s.btnText}>{busy ? "Creating…" : "Create account"}</Text>
        </Pressable>
        <Pressable onPress={() => router.replace("/login")}>
          <Text style={s.link}>Already have an account? Sign in</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
