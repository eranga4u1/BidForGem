import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, GemApiError } from "@/lib/api";
import { uploadGemPhoto, type PickedPhoto } from "@/lib/upload";
import { radius, space, theme } from "@/lib/theme";

const DURATIONS = [
  { label: "1 hour", seconds: 3600 },
  { label: "1 day", seconds: 86400 },
  { label: "3 days", seconds: 259200 },
  { label: "7 days", seconds: 604800 },
];

export default function SellScreen(): React.ReactElement {
  const router = useRouter();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [carat, setCarat] = useState("");
  const [color, setColor] = useState("");
  const [clarity, setClarity] = useState("");
  const [cut, setCut] = useState("");
  const [origin, setOrigin] = useState("");
  const [description, setDescription] = useState("");
  const [startPrice, setStartPrice] = useState("");
  const [minIncrement, setMinIncrement] = useState("");
  const [reserve, setReserve] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(86400);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickPhotos(): Promise<void> {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 12,
      quality: 0.8,
    });
    if (result.canceled) return;
    const picked: PickedPhoto[] = result.assets.map((a) => ({
      uri: a.uri,
      mime: a.mimeType ?? "image/jpeg",
      sizeBytes: a.fileSize ?? 0,
      ...(a.fileName ? { fileName: a.fileName } : {}),
    }));
    setPhotos((prev) => [...prev, ...picked].slice(0, 12));
  }

  async function submit(): Promise<void> {
    const caratNum = Number(carat);
    const startCents = Math.round(Number(startPrice) * 100);
    const incCents = Math.round(Number(minIncrement) * 100);
    const reserveCents = reserve.trim() ? Math.round(Number(reserve) * 100) : undefined;

    if (!title.trim() || !type.trim() || !Number.isFinite(caratNum) || caratNum <= 0) {
      setError("Add a title, a type, and a valid carat weight.");
      return;
    }
    if (
      !Number.isFinite(startCents) ||
      startCents < 0 ||
      !Number.isFinite(incCents) ||
      incCents <= 0
    ) {
      setError("Enter a valid start price and minimum increment.");
      return;
    }

    setError(null);
    setBusy(true);
    try {
      setProgress("Creating listing…");
      const gem = await api.gems.create({
        title: title.trim(),
        type: type.trim(),
        carat: caratNum,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(color.trim() ? { color: color.trim() } : {}),
        ...(clarity.trim() ? { clarity: clarity.trim() } : {}),
        ...(cut.trim() ? { cut: cut.trim() } : {}),
        ...(origin.trim() ? { origin: origin.trim() } : {}),
      });

      for (let i = 0; i < photos.length; i++) {
        setProgress(`Uploading photo ${i + 1} of ${photos.length}…`);
        await uploadGemPhoto(gem.id, photos[i]!);
      }

      setProgress("Publishing…");
      await api.gems.publish(gem.id);

      setProgress("Starting auction…");
      const auction = await api.auctions.create({
        gemId: gem.id,
        startPrice: startCents,
        minIncrement: incCents,
        currency: "USD",
        durationSeconds,
        ...(reserveCents !== undefined ? { reservePrice: reserveCents } : {}),
      });

      router.replace(`/auctions/${auction.id}`);
    } catch (err) {
      setError(
        err instanceof GemApiError ? err.message : "Couldn’t create the listing. Please try again.",
      );
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Photos */}
        <Text style={styles.section}>Photos</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: space.sm }}
        >
          <View style={styles.photoRow}>
            {photos.map((p, i) => (
              <View key={`${p.uri}-${i}`} style={styles.thumb}>
                <Image source={{ uri: p.uri }} style={styles.thumbImg} contentFit="cover" />
                <Pressable
                  style={styles.thumbRemove}
                  onPress={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                  hitSlop={8}
                >
                  <Text style={styles.thumbRemoveText}>×</Text>
                </Pressable>
              </View>
            ))}
            {photos.length < 12 ? (
              <Pressable style={styles.addTile} onPress={() => void pickPhotos()}>
                <Text style={styles.addPlus}>＋</Text>
                <Text style={styles.addLabel}>Add</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>

        {/* Details */}
        <Text style={styles.section}>Gem details</Text>
        <Field
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="Ceylon Blue Sapphire"
        />
        <View style={styles.row}>
          <Field label="Type" value={type} onChangeText={setType} placeholder="sapphire" flex />
          <Field
            label="Carat"
            value={carat}
            onChangeText={setCarat}
            placeholder="2.5"
            keyboardType="decimal-pad"
            flex
          />
        </View>
        <View style={styles.row}>
          <Field label="Color" value={color} onChangeText={setColor} placeholder="Blue" flex />
          <Field label="Clarity" value={clarity} onChangeText={setClarity} placeholder="VS" flex />
        </View>
        <View style={styles.row}>
          <Field label="Cut" value={cut} onChangeText={setCut} placeholder="Oval" flex />
          <Field
            label="Origin"
            value={origin}
            onChangeText={setOrigin}
            placeholder="Sri Lanka"
            flex
          />
        </View>
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Notes on the stone…"
          multiline
        />

        {/* Auction */}
        <Text style={styles.section}>Auction</Text>
        <View style={styles.row}>
          <Field
            label="Start price (USD)"
            value={startPrice}
            onChangeText={setStartPrice}
            placeholder="1000"
            keyboardType="decimal-pad"
            flex
          />
          <Field
            label="Min. increment"
            value={minIncrement}
            onChangeText={setMinIncrement}
            placeholder="50"
            keyboardType="decimal-pad"
            flex
          />
        </View>
        <Field
          label="Reserve price (optional)"
          value={reserve}
          onChangeText={setReserve}
          placeholder="No reserve"
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Duration</Text>
        <View style={styles.chips}>
          {DURATIONS.map((d) => {
            const active = d.seconds === durationSeconds;
            return (
              <Pressable
                key={d.seconds}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setDurationSeconds(d.seconds)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{d.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.btn,
            busy && styles.btnDisabled,
            pressed && !busy && styles.btnPressed,
          ]}
          onPress={() => void submit()}
          disabled={busy}
        >
          <Text style={styles.btnText}>
            {busy ? (progress ?? "Working…") : "Publish & start auction"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  flex,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "decimal-pad";
  multiline?: boolean;
  flex?: boolean;
}): React.ReactElement {
  return (
    <View style={[styles.fieldWrap, flex && { flex: 1 }]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.faint}
        {...(keyboardType ? { keyboardType } : {})}
        {...(multiline ? { multiline: true, numberOfLines: 3 } : {})}
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: space.lg, paddingBottom: 48, gap: 2 },
  section: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: space.lg,
    marginBottom: space.xs,
  },
  photoRow: { flexDirection: "row", gap: space.sm, paddingBottom: space.sm },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: theme.bgElev,
  },
  thumbImg: { width: "100%", height: "100%" },
  thumbRemove: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbRemoveText: { color: "#fff", fontSize: 16, fontWeight: "800", lineHeight: 18 },
  addTile: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderStyle: "dashed",
    backgroundColor: theme.bgElev,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  addPlus: { color: theme.brand, fontSize: 22, fontWeight: "800" },
  addLabel: { color: theme.muted, fontSize: 12 },
  row: { flexDirection: "row", gap: space.md },
  fieldWrap: { marginTop: space.md },
  label: { color: theme.muted, fontSize: 13, marginBottom: 5, marginTop: space.md },
  input: {
    backgroundColor: theme.bgElev,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: radius.md,
    color: theme.text,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: 16,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: 6 },
  chip: {
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: theme.card,
  },
  chipActive: { backgroundColor: theme.brand, borderColor: theme.brand },
  chipText: { color: theme.text, fontWeight: "700", fontSize: 13 },
  chipTextActive: { color: theme.ink },
  error: { color: theme.danger, marginTop: space.md, fontSize: 14 },
  btn: {
    backgroundColor: theme.brand,
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    alignItems: "center",
    marginTop: space.xl,
  },
  btnDisabled: { opacity: 0.6 },
  btnPressed: { opacity: 0.85 },
  btnText: { color: theme.ink, fontWeight: "900", fontSize: 16 },
});
