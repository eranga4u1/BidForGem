import type { BidHistoryItem, PublicAuction, PublicGem } from "@gem/contracts";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { EmptyState } from "@/components/EmptyState";
import { GemThumb } from "@/components/GemThumb";
import { PulseDot } from "@/components/PulseDot";
import { Skeleton } from "@/components/Skeleton";
import { StatusPill } from "@/components/StatusPill";
import { api, tokens } from "@/lib/api";
import { GemApiError, useAuth } from "@/lib/auth";
import { formatCountdown, formatMoney, formatRelative } from "@/lib/format";
import { useAuctionSocket } from "@/lib/socket";
import { radius, space, theme } from "@/lib/theme";

let localBidSeq = 0;

export default function AuctionScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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

  if (pageState === "loading") return <AuctionSkeleton />;

  if (pageState === "error" || !auction || !gem) {
    return (
      <View style={styles.screen}>
        <EmptyState
          tone="error"
          title="This auction couldn’t be loaded"
          subtitle="It may have been removed, or the connection dropped."
          actionLabel="Try again"
          onAction={() => {
            setPageState("loading");
            void sync();
          }}
        />
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
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <GemThumb uri={photo?.url} fill radius={radius.xl} diamond={104} />
      </View>

      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{gem.title}</Text>
          <Text style={styles.muted}>
            {gem.type} · {gem.carat} ct{gem.origin ? ` · ${gem.origin}` : ""}
          </Text>
        </View>
        <StatusPill status={auction.status} />
      </View>

      <View style={styles.card}>
        <View style={styles.statsRow}>
          <View style={{ flex: 1 }}>
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
          <View style={styles.endsCol}>
            <Text style={styles.k}>{ended ? "Auction" : "Ends in"}</Text>
            <Countdown endAt={auction.endAt} ended={ended} />
            {!ended ? (
              <View style={styles.connRow}>
                <PulseDot color={connected ? theme.live : theme.faint} on={connected} />
                <Text style={styles.faint}>{connected ? "Live" : "Reconnecting…"}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.divider} />

        {ended ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              {auction.status === "sold"
                ? `Sold for ${formatMoney(auction.highestBid ?? 0, auction.currency)}.`
                : auction.status === "canceled"
                  ? "This auction was canceled."
                  : "Ended with no sale."}
            </Text>
          </View>
        ) : !user ? (
          <Pressable
            onPress={() => router.push("/login")}
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          >
            <Text style={styles.btnText}>Sign in to bid</Text>
          </Pressable>
        ) : isSeller ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>This is your listing — you can’t bid on it.</Text>
          </View>
        ) : (
          <View>
            <Text style={styles.k}>
              Your bid ({auction.currency}) · min {minLabel}
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
              style={({ pressed }) => [
                styles.btn,
                placing && styles.btnDisabled,
                pressed && !placing && styles.btnPressed,
              ]}
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
        <View style={styles.emptyHist}>
          <Text style={styles.faint}>No bids yet — be the first to bid.</Text>
        </View>
      ) : (
        <View style={styles.histCard}>
          {history.map((b, i) => (
            <View key={b.id} style={[styles.histRow, i === 0 && styles.histRowLead]}>
              <View style={styles.histLeft}>
                <View style={[styles.histAvatar, i === 0 && styles.histAvatarLead]}>
                  <Text style={[styles.histAvatarText, i === 0 && styles.histAvatarTextLead]}>
                    {(b.bidderDisplayName.trim()[0] ?? "?").toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={styles.histName}>{b.bidderDisplayName}</Text>
                  <Text style={styles.histTime}>{formatRelative(b.createdAt)}</Text>
                </View>
              </View>
              <View style={styles.histRight}>
                <Text style={[styles.histAmount, i === 0 && styles.histAmountLead]}>
                  {formatMoney(b.amount, auction.currency)}
                </Text>
                {i === 0 ? <Text style={styles.leadTag}>Leading</Text> : null}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function AuctionSkeleton(): React.ReactElement {
  return (
    <View style={[styles.screen, styles.content]}>
      <Skeleton height={240} radius={radius.xl} />
      <Skeleton width="60%" height={22} style={{ marginTop: space.md }} />
      <Skeleton width="40%" height={14} style={{ marginTop: space.sm }} />
      <View style={[styles.card, { marginTop: space.md }]}>
        <Skeleton width="50%" height={34} />
        <Skeleton width="30%" height={14} style={{ marginTop: space.sm }} />
        <Skeleton height={48} radius={radius.md} style={{ marginTop: space.lg }} />
        <Skeleton height={50} radius={radius.md} style={{ marginTop: space.md }} />
      </View>
    </View>
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
  const urgent = !ended && remaining > 0 && remaining <= 300_000; // < 5 min
  return (
    <Text style={[styles.countdown, urgent && styles.countdownUrgent]}>
      {ended ? "ended" : formatCountdown(remaining)}
    </Text>
  );
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
  content: { padding: space.lg, gap: space.md, paddingBottom: 48 },
  hero: {
    height: 240,
    borderRadius: radius.xl,
    backgroundColor: theme.bgElev,
    overflow: "hidden",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  title: { color: theme.text, fontSize: 23, fontWeight: "900" },
  muted: { color: theme.muted, fontSize: 13, marginTop: 3 },
  card: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  statsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  endsCol: { alignItems: "flex-end" },
  k: { color: theme.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 },
  bigMoney: { color: theme.gold, fontSize: 32, fontWeight: "900", marginVertical: 2 },
  countdown: {
    color: theme.text,
    fontSize: 22,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
    marginVertical: 2,
  },
  countdownUrgent: { color: theme.warn },
  faint: { color: theme.faint, fontSize: 12 },
  connRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  divider: { height: 1, backgroundColor: theme.hairline, marginVertical: space.md + 2 },
  input: {
    backgroundColor: theme.bgElev,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: radius.md,
    color: theme.text,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    fontSize: 18,
    fontWeight: "700",
    marginTop: space.sm,
  },
  btn: {
    backgroundColor: theme.brand,
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    alignItems: "center",
    marginTop: space.md,
  },
  btnDisabled: { opacity: 0.6 },
  btnPressed: { opacity: 0.85 },
  btnText: { color: theme.ink, fontWeight: "900", fontSize: 16 },
  notice: {
    backgroundColor: "rgba(124,196,255,0.08)",
    borderRadius: radius.md,
    padding: space.md,
  },
  noticeText: { color: theme.text, fontSize: 14 },
  error: { color: theme.danger, marginTop: space.sm, fontSize: 14 },
  sectionTitle: { color: theme.text, fontSize: 16, fontWeight: "800", marginTop: space.sm },
  emptyHist: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: radius.lg,
    padding: space.lg,
    alignItems: "center",
  },
  histCard: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
  },
  histRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.hairline,
  },
  histRowLead: { borderBottomColor: "transparent" },
  histLeft: { flexDirection: "row", alignItems: "center", gap: space.md, flex: 1 },
  histAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.bgElev,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  histAvatarLead: { backgroundColor: "rgba(232,195,122,0.16)", borderColor: theme.gold },
  histAvatarText: { color: theme.muted, fontWeight: "800", fontSize: 14 },
  histAvatarTextLead: { color: theme.gold },
  histName: { color: theme.text, fontSize: 14, fontWeight: "700" },
  histTime: { color: theme.faint, fontSize: 12, marginTop: 1 },
  histRight: { alignItems: "flex-end" },
  histAmount: { color: theme.text, fontSize: 15, fontWeight: "800" },
  histAmountLead: { color: theme.gold },
  leadTag: {
    color: theme.gold,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 1,
  },
});
