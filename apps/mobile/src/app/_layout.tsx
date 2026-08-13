// URL / URLSearchParams polyfill — the api-client builds request URLs with
// `new URL(...)`, which React Native's runtime doesn't fully implement.
import "react-native-url-polyfill/auto";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/lib/auth";
import { theme } from "@/lib/theme";

export default function RootLayout(): React.ReactElement {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.text,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Gem — Live Auctions" }} />
        <Stack.Screen name="login" options={{ title: "Sign in" }} />
        <Stack.Screen name="register" options={{ title: "Create account" }} />
        <Stack.Screen name="auctions/[id]" options={{ title: "Auction" }} />
      </Stack>
    </AuthProvider>
  );
}
