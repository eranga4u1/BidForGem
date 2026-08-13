import { StyleSheet } from "react-native";
import { theme } from "./theme";

export const authStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, justifyContent: "center", padding: 20 },
  card: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: 18,
    padding: 20,
    gap: 6,
  },
  title: { color: theme.text, fontSize: 22, fontWeight: "800", marginBottom: 8 },
  label: { color: theme.muted, fontSize: 13, marginTop: 8, marginBottom: 4 },
  input: {
    backgroundColor: "#0f1621",
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: 12,
    color: theme.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  btn: {
    backgroundColor: theme.brand,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#06121f", fontWeight: "800", fontSize: 16 },
  link: { color: theme.brand2, textAlign: "center", marginTop: 16, fontSize: 14 },
  error: { color: theme.danger, marginTop: 10, fontSize: 14 },
});
