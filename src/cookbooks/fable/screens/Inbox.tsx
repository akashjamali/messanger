import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";

import { ChatRow } from "../components/chats/chat-row";
import { INBOX_NAV_H, InboxHeader } from "../components/chats/inbox-header";
import { EASE_OUT } from "../constants/motion";
import { Radius, Space } from "../constants/theme";
import { CHATS, type Chat } from "../data/chats";
import { useFable } from "../data/store";
import { useTheme } from "../hooks/use-theme";
import { useRouterChatStore } from "../../../store/useRouterChatStore";
import { loadDeviceContacts } from "../../../services/contact-matcher";
import { generateNormalizedChatId } from "../../../utils/phone";

export default function ChatsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const threads = useFable((state) => state.threads);

  const checkNetworkAndRouter = useRouterChatStore(
    (s) => s.checkNetworkAndRouter,
  );
  const deleteThreads = useRouterChatStore((s) => s.deleteThreads);

  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(
    new Set(),
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [, setContactsTick] = useState(0);

  useEffect(() => {
    loadDeviceContacts().then(() => setContactsTick((t) => t + 1));
    checkNetworkAndRouter();
    const interval = setInterval(checkNetworkAndRouter, 8000);
    return () => clearInterval(interval);
  }, [checkNetworkAndRouter]);

  const chats: Chat[] = useMemo(() => {
    const chatMap = new Map<string, Chat>();
    for (const c of CHATS) chatMap.set(c.id, c);
    for (const id of Object.keys(threads)) {
      const normId = generateNormalizedChatId(id);
      if (!chatMap.has(normId)) {
        chatMap.set(normId, {
          id: normId,
          personId: normId,
          preview: "",
          time: "",
          unread: 0,
        });
      }
    }
    const list = Array.from(chatMap.values());

    // Phase 4: Strict Sorting - Descending order based on latest message timestamp (newest on top)
    list.sort((a, b) => {
      const threadA = threads[a.id] ?? threads[generateNormalizedChatId(a.id)];
      const threadB = threads[b.id] ?? threads[generateNormalizedChatId(b.id)];
      const lastA = threadA?.at(-1);
      const lastB = threadB?.at(-1);

      const timeA = lastA?.timestamp ?? 0;
      const timeB = lastB?.timestamp ?? 0;

      if (timeA !== timeB) {
        return timeB - timeA;
      }

      return (lastB?.id ?? b.id).localeCompare(lastA?.id ?? a.id);
    });

    return list;
  }, [threads]);

  const toggleSelect = useCallback((chatId: string) => {
    setSelectedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) {
        next.delete(chatId);
      } else {
        next.add(chatId);
      }
      return next;
    });
  }, []);

  const handleCancelSelection = useCallback(() => {
    setSelectedChatIds(new Set());
  }, []);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedChatIds.size === 0 || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteThreads(Array.from(selectedChatIds));
      setSelectedChatIds(new Set());
    } finally {
      setIsDeleting(false);
    }
  }, [selectedChatIds, isDeleting, deleteThreads]);

  const isSelectionMode = selectedChatIds.size > 0;

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <Animated.ScrollView
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingTop: insets.top + INBOX_NAV_H,
          paddingBottom: insets.bottom + Space[6] + (isSelectionMode ? 64 : 0),
        }}
        showsVerticalScrollIndicator={false}
      >
        {chats.map((chat, i) => {
          const isSelected = selectedChatIds.has(chat.id);
          return (
            <Animated.View
              key={chat.id}
              entering={FadeInDown.delay(Math.min(i, 8) * 34)
                .duration(300)
                .easing(EASE_OUT.factory())}
            >
              <ChatRow
                chat={chat}
                selectable={isSelectionMode}
                selected={isSelected}
                onPress={() => {
                  if (isSelectionMode) {
                    toggleSelect(chat.id);
                  } else {
                    useRouterChatStore.getState().markChatAsRead(chat.id);
                    router.push(`/fable/chat/${chat.id}`);
                  }
                }}
                onLongPress={() => toggleSelect(chat.id)}
              />
            </Animated.View>
          );
        })}
      </Animated.ScrollView>

      <InboxHeader
        insetTop={insets.top}
        onPressCompose={() => router.push("/fable/compose")}
        onPressSettings={() => router.push("/fable/settings")}
      />

      {isSelectionMode && (
        <Animated.View
          entering={FadeInDown.duration(260).easing(EASE_OUT.factory())}
          exiting={FadeOutDown.duration(200)}
          style={[
            styles.selectionBar,
            {
              bottom: insets.bottom + 16,
              backgroundColor: theme.surface,
              borderColor: theme.hairline,
            },
          ]}
        >
          <View style={styles.selectionInfo}>
            <Text style={[styles.selectionCount, { color: theme.label }]}>
              {selectedChatIds.size} selected
            </Text>
          </View>

          <View style={styles.selectionActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel selection"
              onPress={handleCancelSelection}
              disabled={isDeleting}
              style={({ pressed }) => [
                styles.cancelButton,
                {
                  backgroundColor: pressed ? theme.chip : "transparent",
                },
              ]}
            >
              <Text style={[styles.cancelText, { color: theme.secondary }]}>
                Cancel
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete selected chats"
              onPress={handleDeleteSelected}
              disabled={isDeleting}
              style={({ pressed }) => [
                styles.deleteButton,
                { opacity: pressed || isDeleting ? 0.75 : 1 },
              ]}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <SymbolView
                    name="trash.fill"
                    size={15}
                    tintColor="#FFFFFF"
                    fallback={<View style={styles.deleteDot} />}
                  />
                  <Text style={styles.deleteText}>Delete</Text>
                </>
              )}
            </Pressable>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  selectionBar: {
    position: "absolute",
    left: Space[4],
    right: Space[4],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radius.bubble,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
  },
  selectionInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  selectionCount: {
    fontSize: 15,
    fontWeight: "600",
  },
  selectionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: "500",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FF3B30",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
  },
  deleteText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  deleteDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
  },
});
