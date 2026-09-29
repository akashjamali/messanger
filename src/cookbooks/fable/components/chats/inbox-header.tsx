import { StyleSheet, Text, View } from "react-native";
import { GlassButton } from "../ui/glass-button";
import { Space } from "../../constants/theme";
import { useTheme } from "../../hooks/use-theme";

export const INBOX_NAV_H = 64;

type Props = {
  insetTop: number;
  onPressCompose: () => void;
  onPressSettings: () => void;
};

export function InboxHeader({
  insetTop,
  onPressCompose,
  onPressSettings,
}: Props) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.root,
        {
          top: 0,
          paddingTop: insetTop + Space[2],
          backgroundColor: theme.bg,
        },
      ]}
    >
      <View style={styles.bar}>
        <View style={styles.left}>
          <GlassButton
            symbol="gearshape"
            accessibilityLabel="Settings"
            onPress={onPressSettings}
          />
        </View>

        <View style={styles.center}>
          <Text style={[styles.title, { color: theme.label }]}>Messages</Text>
        </View>

        <View style={styles.right}>
          <GlassButton
            symbol="square.and.pencil"
            accessibilityLabel="New message"
            onPress={onPressCompose}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: Space[4],
    paddingBottom: Space[3],
  },
  bar: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  left: {
    width: 48,
    alignItems: "flex-start",
  },
  center: {
    flex: 1,
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  right: {
    width: 48,
    alignItems: "flex-end",
  },
});
