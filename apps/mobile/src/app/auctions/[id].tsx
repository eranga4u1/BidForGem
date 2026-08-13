import type { BidHistoryItem, PublicAuction, PublicGem } from "@gem/types";
import { Image } from "expo-image";
import { Link, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, tokens } from "@/lib/api";
import { GemApiError, useAuth } from "@/lib/auth";
import { formatCountdown, formatMoney } from "@/lib/format";
import { useAuctionSocket } from "@/lib/socket";
import { theme } from "@/lib/theme";

let localBidSeq = 0;

export default function AuctionScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [auction, setAuction] = useState<PublicAuction | null>(null);
  const [gem, setGem] = useState<PublicGem | null>(null);
  const [history, setHistory] = useState<BidHistoryItem[]>([]);
  const [pageState, setPageState] = useState<"loading" | "ready" | "error">("loading");
  const [connected, setConnected] = useState(false);
  const [amount, setAmount] = useState("");
  const [placing, setPlacing] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);

  const sync = useCallback(async () => {
    if (!id) return;
    try {
      const a = await api.auctions.get(id);
      const [g, h] = await Promise.all([
        api.gems.get(a.gemId),
        api.auctions.bids(id, { limit: 20 }),
      ]);
      setAuction(a);
      setGem(g);
      setHistory(h.items);
      setPageState("ready");
    } catch {
      setPageState((prev) => (prev === "ready" ? "ready" : "error"));
    }
  }, [id]);

  useEffect(() => {
    void sync();
  }, [sync]);

  useAuctionSocket(id ?? null, {
    token: tokens.access,
    onConnectionChange: setConnected,
    onSync: () => void sync(),
    onBid: (e) => {
      setAuction((prev) =>
        prev
          ? { ...prev, highestBid: e.highestBid, bidCount: e.bidCount, endAt: new Date(e.endAt) }
          : prev,
      );
      setHistory((prev) =>
        [
          {
            id: `live-${++localBidSeq}`,
            amount: e.amount,
            bidderDisplayName: e.bidderDisplayName,
            createdAt: new Date(),
          },
          ...prev,
        ].slice(0, 20),
      );
    },
    onExtended: (e) => setAuction((prev) => (prev ? { ...prev, endAt: new Date(e.endAt) } : prev)),
    onClosed: (e) =>
      setAuction((prev) =>
        prev
          ? {
              ...prev,
              status: e.winnerId ? "sold" : "closed",
              highestBid: e.finalAmount ?? prev.highestBid,
            }
          : prev,
      ),
  });

  if (pageState === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.brand} />
      </View>
    );
  }
  if (pageState === "error" || !auction || !gem) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>This auction couldn’t be loaded.</Text>
      </View>
    );
  }

  const ended =
    auction.status === "closed" || auction.status === "sold" || auction.status === "canceled";
  const minNext =
    auction.highestBid === null ? auction.startPrice : auction.highestBid + auction.minIncrement;
  const minLabel = formatMoney(minNext, auction.currency);
  const isSeller = user?.id === gem.sellerId;
  const photo = gem.media.find((m) => m.type === "photo" && m.status === "ready" && m.url);

  async function placeBid(): Promise<void> {
    if (!auction) return;
    const value = Math.round(Number(amount) * 100);
    if (!Number.isFinite(value) || value <= 0) {
      setBidError("Enter a valid amount.");
      return;
    }
    setBidError(null);
    setPlacing(true);
    const snapshot = auction;
    setAuction({ ...auction, highestBid: value, bidCount: auction.bidCount + 1 });
    try {
      const updated = await api.auctions.placeBid(auction.id, value);
      setAuction(updated);
      setAmount("");
    } catch (err) {
      setAuction(snapshot);
      setBidError(bidErrorMessage(err, minLabel));
    } finally {
      setPlacing(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        {photo?.url ? (
          <Image source={{ uri: photo.url }} style={styles.heroImg} contentFit="cover" />
        ) : (
          <Text style={styles.heroGlyph}>◈</Text>
        )}
      </View>

      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{gem.title}</Text>
          <Text style={styles.muted}>
            {gem.type} · {gem.carat} ct{gem.origin ? ` · ${gem.origin}` : ""}
          </Text>
        </View>
        <View style={[styles.pill, ended ? styles.pillDim : styles.pillLive]}>
          <Text style={styles.pillText}>{ended ? auction.status : "live"}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.statsRow}>
          <View>
            <Text style={styles.k}>Current bid</Text>
            <Text style={styles.bigMoney}>
              {auction.highestBid === null
                ? formatMoney(auction.startPrice, auction.currency)
                : formatMoney(auction.highestBid, auction.currency)}
            </Text>
            <Text style={styles.faint}>
              {auction.bidCount} bid{auction.bidCount === 1 ? "" : "s"}
              {auction.highestBid === null ? " · start price" : ""}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.k}>{ended ? "Auction" : "Ends in"}</Text>
            <Countdown endAt={auction.endAt} ended={ended} />
            <View style={styles.connRow}>
              <View style={[styles.dot, connected ? styles.dotOn : styles.dotOff]} />
              <Text style={styles.faint}>{connected ? "Live" : "Reconnecting…"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {ended ? (
          <Text style={styles.notice}>
            {auction.status === "sold"
              ? `Sold for ${formatMoney(auction.highestBid ?? 0, auction.currency)}.`
              : auction.status === "canceled"
                ? "This auction was canceled."
                : "Ended with no sale."}
          </Text>
        ) : !user ? (
          <Link href="/login" asChild>
            <Pressable style={styles.btn}>
              <Text style={styles.btnText}>Sign in to bid</Text>
            </Pressable>
          </Link>
        ) : isSeller ? (
          <Text style={styles.notice}>You can’t bid on your own gem.</Text>
        ) : (
          <View>
            <Text style={styles.k}>
              Your bid ({auction.currency}) — min {minLabel}
            </Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder={(minNext / 100).toFixed(2)}
              placeholderTextColor={theme.faint}
            />
            {bidError && <Text style={styles.error}>{bidError}</Text>}
            <Pressable
              style={[styles.btn, placing && styles.btnDisabled]}
              onPress={() => void placeBid()}
              disabled={placing}
            >
              <Text style={styles.btnText}>{placing ? "Placing…" : "Place bid"}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <Text style={styles.sectionTitle}>Bid history</Text>
      {history.length === 0 ? (
        <Text style={styles.faint}>No bids yet — be the first.</Text>
      ) : (
        history.map((b) => (
          <View key={b.id} style={styles.histRow}>
            <Text style={styles.histName}>{b.bidderDisplayName}</Text>
            <Text style={styles.histAmount}>{formatMoney(b.amount, auction.currency)}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function Countdown({ endAt, ended }: { endAt: Date; ended: boolean }): React.ReactElement {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (ended) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ended]);
  const remaining = endAt.getTime() - now;
  return <Text style={styles.countdown}>{ended ? "ended" : formatCountdown(remaining)}</Text>;
}

function bidErrorMessage(err: unknown, min: string): string {
  if (err instanceof GemApiError) {
    switch (err.code) {
      case "BID_TOO_LOW":
        return `Your bid is too low. Minimum is ${min}.`;
      case "AUCTION_ENDED":
        return "This auction has ended.";
      case "AUCTION_NOT_ACTIVE":
        return "This auction is not active yet.";
      case "SELF_BID_FORBIDDEN":
        return "You can’t bid on your own gem.";
      case "ALREADY_HIGHEST_BIDDER":
        return "You’re already the highest bidder.";
      case "MISSING_TOKEN":
      case "TOKEN_EXPIRED":
        return "Please sign in to bid.";
      default:
        return err.message;
    }
  }
  return "Could not place bid.";
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg },
  hero: {
    height: 240,
    borderRadius: 18,
    backgroundColor: "#0f1621",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  heroImg: { width: "100%", height: "100%" },
  heroGlyph: { color: theme.gold, fontSize: 64 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  title: { color: theme.text, fontSize: 22, fontWeight: "800" },
  muted: { color: theme.muted, fontSize: 13, marginTop: 2 },
  card: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: 16,
    padding: 16,
  },
  statsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  k: { color: theme.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 },
  bigMoney: { color: theme.gold, fontSize: 30, fontWeight: "900", marginVertical: 2 },
  countdown: { color: theme.text, fontSize: 22, fontWeight: "800", fontVariant: ["tabular-nums"] },
  faint: { color: theme.faint, fontSize: 12 },
  connRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { backgroundColor: theme.live },
  dotOff: { backgroundColor: theme.faint },
  divider: { height: 1, backgroundColor: theme.cardBorder, marginVertical: 14 },
  input: {
    backgroundColor: "#0f1621",
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: 12,
    color: theme.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    marginTop: 6,
  },
  btn: {
    backgroundColor: theme.brand,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#06121f", fontWeight: "800", fontSize: 16 },
  notice: {
    color: theme.text,
    backgroundColor: "rgba(124,196,255,0.08)",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
  },
  error: { color: theme.danger, marginTop: 8, fontSize: 14 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillLive: { backgroundColor: "rgba(79,209,161,0.15)" },
  pillDim: { backgroundColor: "rgba(155,167,186,0.12)" },
  pillText: { color: theme.text, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  sectionTitle: { color: theme.text, fontSize: 16, fontWeight: "700", marginTop: 8 },
  histRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.cardBorder,
  },
  histName: { color: theme.muted, fontSize: 14 },
  histAmount: { color: theme.text, fontSize: 14, fontWeight: "700" },
});
