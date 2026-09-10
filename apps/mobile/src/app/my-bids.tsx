import type { MyBid } from "@gem/contracts";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "@/components/EmptyState";
import { GemThumb } from "@/components/GemThumb";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { radius, space, theme } from "@/lib/theme";

const OUTCOME: Record<MyBid["outcome"], { label: string; color: string }> = {
  leading: { label: "Leading", color: theme.success },
  won: { label: "Won", color: theme.gold },
  outbid: { label: "Outbid", color: theme.warn },
  lost: { label: "Lost", color: theme.danger },
  ended: { label: "Ended", color: theme.faint },
};

export default function MyBidsScreen(): React.ReactElement {
  const router = useRouter();
  const [items, setItems] = useState<MyBid[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    try {
      const r = await api.auctions.myBids({ limit: 50 });
      setItems(r.items);
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

  if (state === "loading") {
    return (
      <View style={[styles.screen, styles.list]}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={76} radius={radius.lg} />
        ))}
      </View>
    );
  }
  if (state === "error") {
    return (
      <View style={styles.screen}>
        <EmptyState
          tone="error"
          title="Couldn’t load your bids"
          actionLabel="Retry"
          onAction={() => {
            setState("loading");
            void load();
          }}
        />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={items.length === 0 ? { flexGrow: 1 } : styles.list}
      data={items}
      keyExtractor={(b) => b.auctionId}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <EmptyState title="No bids yet" subtitle="Auctions you bid on will show up here." />
      }
      renderItem={({ item: b }) => {
        const o = OUTCOME[b.outcome];
        return (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => router.push(`/auctions/${b.auctionId}`)}
          >
            <GemThumb uri={b.photoUrl} size={56} radius={radius.md} diamond={22} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {b.gemTitle}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                Your bid {formatMoney(b.myMaxBid, b.currency)} · Top{" "}
                {b.highestBid !== null ? formatMoney(b.highestBid, b.currency) : "—"}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: `${o.color}22` }]}>
              <Text style={[styles.badgeText, { color: o.color }]}>{o.label}</Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  list: { padding: space.lg, gap: space.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    borderRadius: radius.lg,
    padding: space.md,
  },
  pressed: { opacity: 0.7 },
  title: { color: theme.text, fontSize: 15, fontWeight: "800" },
  sub: { color: theme.muted, fontSize: 12, marginTop: 2 },
  badge: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
});
