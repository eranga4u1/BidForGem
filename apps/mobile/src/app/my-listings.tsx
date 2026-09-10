import type { MyListing } from "@gem/contracts";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "@/components/EmptyState";
import { GemThumb } from "@/components/GemThumb";
import { Skeleton } from "@/components/Skeleton";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { radius, space, theme } from "@/lib/theme";

const GEM_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: theme.faint },
  active: { label: "Active", color: theme.success },
  sold: { label: "Sold", color: theme.gold },
  closed: { label: "Closed", color: theme.faint },
};

export default function MyListingsScreen(): React.ReactElement {
  const router = useRouter();
  const [items, setItems] = useState<MyListing[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    try {
      const r = await api.gems.mine({ limit: 50 });
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
          title="Couldn’t load your listings"
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
      keyExtractor={(l) => l.gem.id}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <EmptyState
          title="No listings yet"
          subtitle="Tap ＋ Sell on the home screen to list a gem."
          actionLabel="List a gem"
          onAction={() => router.push("/sell")}
        />
      }
      renderItem={({ item: { gem, auction } }) => {
        const photo = gem.media.find((m) => m.type === "photo" && m.status === "ready" && m.url);
        const st = GEM_STATUS[gem.status] ?? { label: gem.status, color: theme.faint };
        return (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => {
              if (auction) router.push(`/auctions/${auction.id}`);
            }}
          >
            <GemThumb uri={photo?.url ?? null} size={56} radius={radius.md} diamond={22} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {gem.title}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {gem.type} · {gem.carat} ct
                {auction ? ` · ${auction.bidCount} bid${auction.bidCount === 1 ? "" : "s"}` : ""}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <View style={[styles.badge, { backgroundColor: `${st.color}22` }]}>
                <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
              </View>
              {auction && auction.highestBid !== null ? (
                <Text style={styles.amount}>
                  {formatMoney(auction.highestBid, auction.currency)}
                </Text>
              ) : null}
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
  amount: { color: theme.gold, fontSize: 13, fontWeight: "800" },
});
