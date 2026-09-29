import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardChatScrollView } from "react-native-keyboard-controller";
import Animated, { FadeInDown, FadeOut, useAnimatedRef } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";

import { Bubble } from "../components/thread/bubble";
import { Composer } from "../components/thread/composer";
import { AttachmentSheet } from "../components/thread/attachment-sheet";
import { THREAD_NAV_H, ThreadHeader } from "../components/thread/thread-header";
import { EASE_OUT } from "../constants/motion";
import { Accent, Radius, Space, Type } from "../constants/theme";
import { messagesFor } from "../data/messages";
import { getPerson } from "../data/people";
import { useTheme } from "../hooks/use-theme";

import { useFable } from "../data/store";
import { NotFound } from "../../NotFound";
import { useRouterChatStore } from "../../../store/useRouterChatStore";
import { chatCache } from "../../../services/chat-cache-service";
import { generateNormalizedChatId } from "../../../utils/phone";

export default function ConversationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return <NotFound home="/fable" />;
  return <ThreadScreen key={id} id={id} />;
}

function ThreadScreen({ id }: { id: string }) {
  const person = getPerson(id);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const sendMessage = useRouterChatStore((s) => s.sendMessage);

  // Single source of truth: Universal normalized chatId for this conversation
  const currentChatId = useMemo(
    () => generateNormalizedChatId(person.phone || id),
    [person.phone, id],
  );

  const stored = useFable(
    (state) =>
      state.threads[currentChatId] ??
      state.threads[id] ??
      (person.phone ? state.threads[person.phone] : undefined),
  );
  const initial = useMemo(
    () => messagesFor(person.id, person.first),
    [person.id, person.first],
  );
  const messages = useMemo(() => {
    const list = [...(stored ?? initial)];

    // 1. RECONCILE SENDER DIRECTION: Strictly resolve isMe / from for each message
    const targetPhone = person.phone || id;
    const reconciled = list.map((m) => {
      const isSent =
        m.isMe === true ||
        m.from === "me" ||
        chatCache.isSentMessage(targetPhone, m.text, (m as any).tag) ||
        chatCache.isSentMessage(id, m.text, (m as any).tag) ||
        chatCache.isSentMessage(currentChatId, m.text, (m as any).tag) ||
        chatCache.isSentId(m.id);

      return {
        ...m,
        from: (isSent ? "me" : "them") as "me" | "them",
        isMe: isSent,
      };
    });

    // 2. ECHO PURGE: Discard any 'them' message that duplicates our own sent message in this thread
    const sentTexts = new Set(
      reconciled
        .filter((m) => m.from === "me" || m.isMe)
        .map((m) => m.text.trim()),
    );
    const deduplicated = reconciled.filter((m) => {
      if ((m.from === "them" && !m.isMe) && sentTexts.has(m.text.trim())) {
        return false;
      }
      return true;
    });

    // 3. STRICT ASCENDING SORT: Oldest at top, Newest at bottom for standard ScrollView
    deduplicated.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    return deduplicated;
  }, [stored, initial, id, person.phone, currentChatId]);

  // Register active chat and mark as read — fire-and-forget, outside render cycle
  useEffect(() => {
    const store = useRouterChatStore.getState();
    if (store.activeChatId !== currentChatId) {
      store.setActiveChatId(currentChatId);
    }
    useFable.getState().markRead(currentChatId);
    return () => {
      useRouterChatStore.getState().setActiveChatId(null);
    };
  }, [currentChatId]);
  const [mountedCount] = useState(messages.length);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const positioned = useRef(false);
  const initialFrame = useRef<number | null>(null);
  const listRef = useAnimatedRef<Animated.ScrollView>();
  const [composerHeight, setComposerHeight] = useState(0);
  const [attachmentVisible, setAttachmentVisible] = useState(false);
  const [profileDropdownVisible, setProfileDropdownVisible] = useState(false);

  // Include the floating composer in content geometry before the initial scroll.
  // Keyboard Controller supplies only the moving keyboard inset.
  const positionInitially = useCallback(() => {
    if (positioned.current || composerHeight === 0) return;
    positioned.current = true;
    initialFrame.current = requestAnimationFrame(() =>
      listRef.current?.scrollToEnd({ animated: false }),
    );
  }, [composerHeight, listRef]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);
  useEffect(
    () => () => {
      if (initialFrame.current !== null)
        cancelAnimationFrame(initialFrame.current);
    },
    [],
  );

  const scrollToEnd = useCallback(() => {
    const t = setTimeout(
      () => listRef.current?.scrollToEnd({ animated: true }),
      40,
    );
    timers.current.push(t);
  }, [listRef]);

  // Live receive auto-scroll: when new incoming message arrives on active screen
  const prevCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevCount.current) {
      scrollToEnd();
    }
    prevCount.current = messages.length;
  }, [messages.length, scrollToEnd]);

  const onSend = useCallback(
    (text: string, photo = false, imageUri?: string) => {
      const targetPhone = person.phone || id;
      const isTargetNumber = /[0-9+]/.test(targetPhone);

      if (!photo && !imageUri && isTargetNumber) {
        sendMessage(text, targetPhone, currentChatId).catch(() => {});
      } else {
        useFable
          .getState()
          .append(
            currentChatId,
            text,
            "me",
            photo,
            imageUri,
            "sent",
            "now",
            undefined,
            undefined,
            true,
          );
      }
      scrollToEnd();
    },
    [scrollToEnd, id, currentChatId, sendMessage, person.phone],
  );

  const rows = useMemo(
    () =>
      messages.map((msg, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const isMine = msg.isMe ?? (msg.from === "me");
        const nextIsThem = next && !(next.isMe ?? (next.from === "me"));
        // Contact avatar is strictly ONLY rendered for incoming messages (isMe === false)
        const showAvatar = !isMine && !nextIsThem;
        const first = !prev || (prev.isMe ?? (prev.from === "me")) !== isMine;
        const yesterday = msg.at.startsWith("Yesterday");
        const dayBreak = !prev || prev.at.startsWith("Yesterday") !== yesterday;
        const label = dayBreak ? (yesterday ? "Yesterday" : "Today") : null;
        return { msg, showAvatar, first, label, animate: i >= mountedCount };
      }),
    [messages, mountedCount],
  );

  const panelTop = insets.top + THREAD_NAV_H + Space[1];

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <ThreadHeader
        person={person}
        insetTop={insets.top}
        onPressProfile={() => setProfileDropdownVisible((v) => !v)}
      />

      {/* The panel: one big rounded card the conversation lives in. */}
      <View
        style={[
          styles.panel,
          { top: panelTop, backgroundColor: theme.surface },
        ]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={[theme.surface, theme.panelEnd]}
          locations={[0, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.grabberWrap}>
          <View style={[styles.grabber, { backgroundColor: theme.grabber }]} />
        </View>
        <KeyboardChatScrollView
          ref={listRef as unknown as Ref<Animated.ScrollView>}
          // The composer's safe-area padding sits over the keyboard when it is open, so lift by the rest.
          offset={insets.bottom}
          keyboardLiftBehavior="always"
          keyboardDismissMode="interactive"
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={positionInitially}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: composerHeight + Space[2] },
          ]}
        >
          {rows.map(({ msg, showAvatar, first, label, animate }) => (
            <View key={msg.id}>
              {label && (
                <Text
                  style={[Type.caption, styles.day, { color: theme.tertiary }]}
                >
                  {label}
                </Text>
              )}
              <Bubble
                message={msg}
                person={person}
                showAvatar={showAvatar}
                first={first}
                animate={animate}
              />
            </View>
          ))}
        </KeyboardChatScrollView>
      </View>

      <Composer
        insetBottom={insets.bottom}
        onSend={onSend}
        onAttach={() => setAttachmentVisible(true)}
        onLayoutHeight={setComposerHeight}
      />

      <AttachmentSheet
        visible={attachmentVisible}
        onClose={() => setAttachmentVisible(false)}
        onSelectImage={(uri) => onSend("", true, uri)}
      />

      {profileDropdownVisible && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close profile details"
            style={styles.backdrop}
            onPress={() => setProfileDropdownVisible(false)}
          />
          <Animated.View
            entering={FadeInDown.duration(220).easing(EASE_OUT.factory())}
            exiting={FadeOut.duration(180)}
            style={[
              styles.dropdownCard,
              {
                top: insets.top + THREAD_NAV_H + 4,
                backgroundColor: theme.surface,
                borderColor: theme.hairline,
              },
            ]}
          >
            <View style={styles.dropdownRow}>
              <SymbolView
                name="phone.fill"
                size={14}
                tintColor={Accent}
                fallback={<View style={[styles.dot, { backgroundColor: Accent }]} />}
              />
              <Text
                selectable
                style={[styles.dropdownPhone, { color: theme.label }]}
              >
                {person.phone || person.id}
              </Text>
            </View>
            {person.name !== (person.phone || person.id) && (
              <Text style={[styles.dropdownSub, { color: theme.secondary }]}>
                {person.name}
              </Text>
            )}
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -Radius.panel,
    borderRadius: Radius.panel,
    borderCurve: "continuous",
    overflow: "hidden",
    paddingBottom: Radius.panel,
  },
  grabberWrap: {
    position: "absolute",
    top: 10,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 2,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
  },
  content: {
    paddingTop: Space[6],
  },
  day: {
    textAlign: "center",
    marginTop: Space[5],
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "transparent",
  },
  dropdownCard: {
    position: "absolute",
    alignSelf: "center",
    minWidth: 180,
    maxWidth: 280,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 99,
  },
  dropdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dropdownPhone: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  dropdownSub: {
    fontSize: 12,
    marginTop: 3,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
