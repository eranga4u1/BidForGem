import type { PublicAuction, PublicGem } from "@gem/contracts";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "@/components/EmptyState";
import { GemThumb } from "@/components/GemThumb";
import { Skeleton } from "@/components/Skeleton";
import { StatusPill } from "@/components/StatusPill";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatEndsIn, formatMoney, isEndingSoon } from "@/lib/format";
import { radius, space, theme } from "@/lib/theme";

interface Row {
  auction: PublicAuction;
  gem: PublicGem | undefined;
}

export default function BrowseScreen(): React.ReactElement {
  const { status, user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [auctions, gems] = await Promise.all([
        api.auctions.list({ limit: 50 }),
        api.gems.list({ limit: 50 }),
      ]);
      const byId = new Map(gems.items.map((g) => [g.id, g]));
      setRows(auctions.items.map((a) => ({ auction: a, gem: byId.get(a.gemId) })));
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const liveCount = rows.filter((r) => r.auction.status === "active").length;

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>MARKETPLACE</Text>
          <Text style={styles.h1}>Live auctions</Text>
          <Text style={styles.subtitle}>
            {state === "ready"
              ? liveCount > 0
                ? `${liveCount} live right now`
                : "Nothing live at the moment"
              : "Fine gems, sold to the highest bidder"}
          </Text>
        </View>
        {status === "authenticated" ? (
          <View style={styles.badge}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user?.name?.trim()?.[0] ?? "Y").toUpperCase()}
              </Text>
            </View>
            <Text style={styles.badgeText}>{user?.name?.split(" ")[0] ?? "You"}</Text>
          </View>
        ) : (
          <Link href="/login" asChild>
            <Pressable style={({ pressed }) => [styles.signIn, pressed && styles.pressed]}>
              <Text style={styles.signInText}>Sign in</Text>
            </Pressable>
          </Link>
        )}
      </View>

      {state === "loading" ? (
        <View style={styles.list}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : state === "error" ? (
        <EmptyState
          tone="error"
          title="Couldn’t load auctions"
          subtitle="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => {
            setState("loading");
            void load();
          }}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.auction.id}
          contentContainerStyle={rows.length === 0 ? styles.emptyList : styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />
          }
          ListEmptyComponent={
            <EmptyState
              title="No live auctions yet"
              subtitle="Check back soon — new gems go under the hammer every day."
            />
          }
          renderItem={({ item }) => <AuctionCard row={item} />}
        />
      )}
    </View>
  );
}

function AuctionCard({ row }: { row: Row }): React.ReactElement {
  const router = useRouter();
  const { auction, gem } = row;
  const photo = gem?.media.find((m) => m.type === "photo" && m.status === "ready" && m.url);
  const price =
    auction.highestBid === null
      ? formatMoney(auction.startPrice, auction.currency)
      : formatMoney(auction.highestBid, auction.currency);
  const active = auction.status === "active";
  const soon = active && isEndingSoon(auction.endAt);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => router.push(`/auctions/${auction.id}`)}
    >
      <GemThumb uri={photo?.url} size={72} radius={radius.md} diamond={30} />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {gem?.title ?? "Gem"}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {gem ? `${gem.type} · ${gem.carat} ct${gem.origin ? ` · ${gem.origin}` : ""}` : ""}
        </Text>
        <View style={styles.cardMetaRow}>
          <Text style={styles.price}>{price}</Text>
          <Text style={styles.faint}>
            · {auction.bidCount} bid{auction.bidCount === 1 ? "" : "s"}
          </Text>
        </View>
      </View>
      <View style={styles.cardRight}>
        <StatusPill status={auction.status} />
        {active ? (
          <Text style={[styles.endsIn, soon && styles.endsSoon]}>
            {soon ? "⚡ " : ""}
            {formatEndsIn(auction.endAt.getTime() - Date.now())} left
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function SkeletonCard(): React.ReactElement {
  return (
    <View style={styles.card}>
      <Skeleton width={72} height={72} radius={radius.md} />
      <View style={styles.cardBody}>
        <Skeleton width="70%" height={16} />
        <Skeleton width="45%" height={12} style={{ marginTop: 8 }} />
        <Skeleton width="35%" height={16} style={{ marginTop: 10 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: space.lg + 2,
    paddingTop: space.md,
    paddingBottom: space.sm,
    gap: space.md,
  },
  eyebrow: { color: theme.brand2, fontSize: 11, letterSpacing: 2, fontWeight: "800" },
  h1: { color: theme.text, fontSize: 27, fontWeight: "900", marginTop: 2 },
  subtitle: { color: theme.muted, fontSize: 13, marginTop: 3 },
  list: { padding: space.lg, gap: space.md },
  emptyList: { flexGrow: 1 },
  card: {
    flexDirection: "row",
    backgroundColor: theme.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    padding: space.md,
    gap: space.md,
    alignItems: "center",
  },
  pressed: { opacity: 0.7 },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { color: theme.text, fontSize: 16, fontWeight: "800" },
  cardMetaRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 5 },
  price: { color: theme.gold, fontSize: 18, fontWeight: "900" },
  muted: { color: theme.muted, fontSize: 13 },
  faint: { color: theme.faint, fontSize: 12 },
  cardRight: { alignItems: "flex-end", gap: 8, alignSelf: "stretch" },
  endsIn: { color: theme.faint, fontSize: 12, fontWeight: "700" },
  endsSoon: { color: theme.warn },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: radius.pill,
    paddingLeft: 4,
    paddingRight: space.md,
    paddingVertical: 4,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: theme.ink, fontWeight: "900", fontSize: 13 },
  badgeText: { color: theme.text, fontWeight: "800", fontSize: 13 },
  signIn: {
    backgroundColor: theme.brand,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
  },
  signInText: { color: theme.ink, fontWeight: "900", fontSize: 13 },
});
