import type { PublicAuction, PublicGem } from "@gem/types";
import { Image } from "expo-image";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { theme } from "@/lib/theme";

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

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>MARKETPLACE</Text>
          <Text style={styles.h1}>Live auctions</Text>
        </View>
        {status === "authenticated" ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{user?.name?.split(" ")[0] ?? "You"}</Text>
          </View>
        ) : (
          <Link href="/login" asChild>
            <Pressable style={styles.signIn}>
              <Text style={styles.signInText}>Sign in</Text>
            </Pressable>
          </Link>
        )}
      </View>

      {state === "loading" ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      ) : state === "error" ? (
        <View style={styles.center}>
          <Text style={styles.error}>Couldn’t load auctions.</Text>
          <Pressable onPress={() => void load()} style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.auction.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />
          }
          ListEmptyComponent={<Text style={styles.muted}>No live auctions yet.</Text>}
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

  return (
    <Pressable style={styles.card} onPress={() => router.push(`/auctions/${auction.id}`)}>
      <View style={styles.thumb}>
        {photo?.url ? (
          <Image source={{ uri: photo.url }} style={styles.thumbImg} contentFit="cover" />
        ) : (
          <Text style={styles.thumbGlyph}>◈</Text>
        )}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {gem?.title ?? "Gem"}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {gem ? `${gem.type} · ${gem.carat} ct` : ""}
        </Text>
        <View style={styles.cardMetaRow}>
          <Text style={styles.price}>{price}</Text>
          <Text style={styles.faint}>
            {auction.bidCount} bid{auction.bidCount === 1 ? "" : "s"}
          </Text>
        </View>
      </View>
      <View style={[styles.pill, auction.status === "active" ? styles.pillLive : styles.pillDim]}>
        <Text style={styles.pillText}>{auction.status}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
  },
  eyebrow: { color: theme.brand2, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  h1: { color: theme.text, fontSize: 26, fontWeight: "800", marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  list: { padding: 16, gap: 12 },
  card: {
    flexDirection: "row",
    backgroundColor: theme.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    padding: 12,
    gap: 12,
    alignItems: "center",
  },
  thumb: {
    width: 68,
    height: 68,
    borderRadius: 12,
    backgroundColor: "#0f1621",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%" },
  thumbGlyph: { color: theme.gold, fontSize: 26 },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { color: theme.text, fontSize: 16, fontWeight: "700" },
  cardMetaRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 4 },
  price: { color: theme.gold, fontSize: 17, fontWeight: "800" },
  muted: { color: theme.muted, fontSize: 13 },
  faint: { color: theme.faint, fontSize: 12 },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pillLive: { backgroundColor: "rgba(79,209,161,0.15)" },
  pillDim: { backgroundColor: "rgba(155,167,186,0.12)" },
  pillText: { color: theme.text, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  badge: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: { color: theme.text, fontWeight: "700", fontSize: 13 },
  signIn: {
    backgroundColor: theme.brand,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  signInText: { color: "#06121f", fontWeight: "800", fontSize: 13 },
  error: { color: theme.danger, fontSize: 14 },
  retry: {
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: { color: theme.text, fontWeight: "700" },
});
