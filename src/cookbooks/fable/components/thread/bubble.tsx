import { Image } from "expo-image";
import { router } from "expo-router";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeInDown,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { Avatar } from "../ui/avatar";
import { EASE_OUT, SOFT } from "../../constants/motion";
import { Ink, Radius, Space, Type } from "../../constants/theme";
import type { Message } from "../../data/messages";
import type { Person } from "../../data/people";
import { useScheme, useTheme } from "../../hooks/use-theme";

export const BUBBLE_AVATAR = 26;

/**
 * Outgoing bubbles leave the composer: they start where the text was typed,
 * a shade lighter and slightly larger (the composer's own scale), and settle
 * into place as ink. Scaling down from 1.02 keeps the glyphs crisp.
 */
const enterOutgoing = () => {
  "worklet";
  return {
    initialValues: {
      opacity: 0,
      transform: [{ translateY: 22 }, { scale: 1.02 }],
    },
    animations: {
      opacity: withTiming(1, { duration: 140 }),
      transform: [
        { translateY: withSpring(0, SOFT) },
        { scale: withSpring(1, SOFT) },
      ],
    },
  };
};

type Props = {
  message: Message;
  person: Person;
  showAvatar: boolean; // last incoming bubble in a run carries the avatar, grouped by sender
  first: boolean; // first bubble of a run gets the wider gap
  animate: boolean; // only messages that arrive after mount animate in
};

export const Bubble = memo(function Bubble({
  message,
  person,
  showAvatar,
  first,
  animate,
}: Props) {
  const theme = useTheme();
  const scheme = useScheme();
  const mine = message.isMe !== undefined ? message.isMe : message.from === "me";

  return (
    <Animated.View
      entering={
        animate
          ? mine
            ? enterOutgoing
            : FadeInDown.duration(260).easing(EASE_OUT.factory())
          : undefined
      }
      style={[
        styles.row,
        mine ? styles.rowMine : styles.rowTheirs,
        { marginTop: first ? Space[5] : Space[2] },
      ]}
    >
      {!mine && (
        <View style={styles.avatarSlot}>
          {showAvatar && (
            <Avatar
              source={person.avatar}
              name={person.name}
              size={BUBBLE_AVATAR}
            />
          )}
        </View>
      )}
      {message.photo ? (
        <View style={{ maxWidth: "74%", alignItems: mine ? "flex-end" : "flex-start" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open shared photo"
            onPress={() =>
              router.push({
                pathname: "/fable/photo",
                params: {
                  id: person.id,
                  ...(message.imageUri ? { uri: message.imageUri } : {}),
                },
              })
            }
            style={{
              width: 220,
              aspectRatio: 0.9,
              borderRadius: 24,
              overflow: "hidden",
              backgroundColor: theme.surface,
            }}
          >
            {message.imageUri ? (
              <Image
                source={{ uri: message.imageUri }}
                style={{ flex: 1 }}
                contentFit="cover"
              />
            ) : person.avatar ? (
              <Image
                source={person.avatar}
                style={{ flex: 1 }}
                contentFit="cover"
              />
            ) : (
              <Avatar source={person.avatar} name={person.name} size={120} />
            )}
          </Pressable>
          {message.text ? (
            <View
              style={[
                styles.bubble,
                mine ? styles.mine : styles.theirs,
                {
                  marginTop: 6,
                  backgroundColor: mine ? theme.outgoing : theme.surface,
                },
              ]}
            >
              <Text
                selectable
                style={[
                  Type.body,
                  { color: mine ? theme.outgoingText : theme.incomingText },
                ]}
              >
                {message.text}
              </Text>
            </View>
          ) : null}
        </View>
      ) : mine ? (
        <View style={{ alignItems: "flex-end", alignSelf: "flex-end", maxWidth: "74%" }}>
          <View
            style={[
              styles.bubble,
              styles.mine,
              {
                alignSelf: "flex-end",
                maxWidth: "100%",
                backgroundColor:
                  message.status === "failed"
                    ? "#D32F2F"
                    : theme.outgoing,
                opacity: message.status === "sending" ? 0.75 : 1,
              },
            ]}
          >
            <Text selectable style={[Type.body, { color: theme.outgoingText }]}>
              {message.text}
            </Text>
          </View>
          {message.status === "failed" && (
            <Text
              style={[
                Type.caption,
                { color: "#FF3B30", marginTop: 3, marginRight: 8, fontSize: 11 },
              ]}
            >
              Failed to send
            </Text>
          )}
        </View>
      ) : (
        <View
          style={[
            styles.bubble,
            styles.theirs,
            {
              alignSelf: "flex-start",
              backgroundColor: theme.surface,
              boxShadow:
                scheme === "dark"
                  ? undefined
                  : "0 4px 18px rgba(16, 16, 18, 0.05)",
            },
          ]}
        >
          <Text selectable style={[Type.body, { color: theme.incomingText }]}>
            {message.text}
          </Text>
        </View>
      )}
    </Animated.View>
  );
});

export { Ink };

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: Space[4],
    width: "100%",
  },
  rowMine: {
    justifyContent: "flex-end",
    alignSelf: "flex-end",
  },
  rowTheirs: {
    justifyContent: "flex-start",
    alignSelf: "flex-start",
    gap: 8,
  },
  avatarSlot: {
    width: BUBBLE_AVATAR,
    height: BUBBLE_AVATAR,
  },
  bubble: {
    maxWidth: "74%",
    borderRadius: Radius.bubble,
    borderCurve: "continuous",
  },
  mine: {
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  theirs: {
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
});
