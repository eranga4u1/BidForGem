import {
  AUCTION_MAX_DURATION_SECONDS,
  AUCTION_MIN_DURATION_SECONDS,
  type PublicAuction,
} from "@gem/contracts";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api, GemApiError } from "@/lib/api";
import { AUCTION_DURATIONS } from "@/lib/auction-terms";
import { authStyles as s } from "@/lib/auth-styles";
import { formatEndsIn } from "@/lib/format";
import { radius, space, theme } from "@/lib/theme";

function amountForInput(minor: number): string {
  const fraction = minor % 100;
  const whole = (minor - fraction) / 100;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, "0")}`;
}

function amountInMinorUnits(value: string): number | null {
  const amount = value.trim().replace(",", ".");
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(amount)) return null;
  const [whole = "", fraction = ""] = amount.split(".");
  const minor = Number(whole + fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

export function RepostAuctionForm({
  auction,
  onCancel,
  onPosted,
}: {
  auction: PublicAuction;
  onCancel: () => void;
  onPosted: (id: string) => void;
}): React.ReactElement {
  const [start, setStart] = useState(() => amountForInput(auction.startPrice));
  const [increment, setIncrement] = useState(() => amountForInput(auction.minIncrement));
  const [reserve, setReserve] = useState(() =>
    auction.reservePrice === null ? "" : amountForInput(auction.reservePrice),
  );
  const previousDuration = Math.round((auction.endAt.getTime() - auction.startAt.getTime()) / 1000);
  const validPreviousDuration =
    previousDuration >= AUCTION_MIN_DURATION_SECONDS &&
    previousDuration <= AUCTION_MAX_DURATION_SECONDS;
  const durationOptions =
    validPreviousDuration &&
    !AUCTION_DURATIONS.some((option) => option.seconds === previousDuration)
      ? [
          ...AUCTION_DURATIONS,
          {
            label: `Previous (${formatEndsIn(previousDuration * 1000)})`,
            seconds: previousDuration,
          },
        ]
      : AUCTION_DURATIONS;
  const [durationSeconds, setDurationSeconds] = useState(
    validPreviousDuration ? previousDuration : 86400,
  );
  const [posting, setPosting] = useState(false);
  const requestInFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function repost(): Promise<void> {
    if (requestInFlight.current) return;
    const startPrice = amountInMinorUnits(start);
    const minIncrement = amountInMinorUnits(increment);
    const reservePrice = reserve.trim() ? amountInMinorUnits(reserve) : undefined;
    if (
      startPrice === null ||
      minIncrement === null ||
      minIncrement === 0 ||
      reservePrice === null
    ) {
      setError("Enter valid prices and a bid increment greater than zero.");
      return;
    }
    if (reservePrice !== undefined && reservePrice < startPrice) {
      setError("The reserve price must be at least the starting price.");
      return;
    }

    requestInFlight.current = true;
    setPosting(true);
    setError(null);
    try {
      const posted = await api.auctions.create({
        gemId: auction.gemId,
        currency: auction.currency,
        startPrice,
        minIncrement,
        durationSeconds,
        ...(reservePrice === undefined ? {} : { reservePrice }),
        antiSnipeWindowSeconds: auction.antiSnipeWindowSeconds,
        antiSnipeExtendSeconds: auction.antiSnipeExtendSeconds,
      });
      onPosted(posted.id);
    } catch (err) {
      setError(
        err instanceof GemApiError && err.code === "AUCTION_ALREADY_EXISTS"
          ? "This listing already has a live or scheduled auction. Check My listings."
          : err instanceof GemApiError
            ? err.message
            : "Couldn’t confirm the new auction. Check My listings before trying again.",
      );
    } finally {
      requestInFlight.current = false;
      setPosting(false);
    }
  }

  const fields = [
    { label: `Starting price (${auction.currency})`, value: start, onChangeText: setStart },
    {
      label: `Minimum increment (${auction.currency})`,
      value: increment,
      onChangeText: setIncrement,
    },
    { label: "Reserve price (optional)", value: reserve, onChangeText: setReserve },
  ];

  return (
    <View style={s.card}>
      <Text style={s.title}>Repost auction</Text>
      <Text style={styles.hint}>
        A new auction starts immediately with your existing listing and photos.
      </Text>
      {fields.map(({ label, value, onChangeText }) => (
        <View key={label}>
          <Text style={s.label}>{label}</Text>
          <TextInput
            accessibilityLabel={label}
            style={s.input}
            keyboardType="decimal-pad"
            editable={!posting}
            value={value}
            onChangeText={onChangeText}
          />
        </View>
      ))}
      <Text style={s.label}>Duration</Text>
      <View style={styles.options}>
        {durationOptions.map(({ label, seconds }) => {
          const selected = durationSeconds === seconds;
          return (
            <Pressable
              key={seconds}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: posting }}
              disabled={posting}
              onPress={() => setDurationSeconds(seconds)}
              style={[styles.option, selected && styles.selectedOption]}
            >
              <Text style={[styles.optionText, selected && styles.selectedText]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={posting}
        onPress={() => void repost()}
        style={[s.btn, posting && s.btnDisabled]}
      >
        <Text style={s.btnText}>{posting ? "Reposting…" : "Start new auction"}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={posting} onPress={onCancel}>
        <Text style={s.link}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { color: theme.muted, fontSize: 14 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  option: {
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  selectedOption: { backgroundColor: theme.brand, borderColor: theme.brand },
  optionText: { color: theme.text, fontWeight: "700", fontSize: 13 },
  selectedText: { color: theme.ink },
});
