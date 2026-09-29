import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Accent } from "../../constants/theme";
import { useScheme, useTheme } from "../../hooks/use-theme";

type Props = {
  source?: number | { uri: string } | null;
  name?: string;
  size: number;
  ring?: "unread" | "seen" | "none";
  ringWidth?: number;
  style?: StyleProp<ViewStyle>;
};

function getInitials(name?: string): string {
  if (!name || !name.trim()) return "?";
  const clean = name.trim();
  const digits = clean.replace(/\D/g, "");
  if (digits.length >= 2 && /^[\d+]/.test(clean)) {
    return digits.slice(0, 2);
  }
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export function Avatar({
  name,
  size,
  ring = "none",
  ringWidth: ringWidthProp,
  style,
}: Props) {
  const theme = useTheme();
  const scheme = useScheme();
  const ringWidth =
    ring === "none" ? 0 : (ringWidthProp ?? Math.max(2, size * 0.04));
  const gap = ring === "none" ? 0 : Math.max(2, size * 0.035);
  const inner = Math.max(16, size - 2 * (ringWidth + gap));
  const initials = getInitials(name);
  const solidBg = scheme === "dark" ? "#2C2C2E" : "#E5E5EA";

  return (
    <View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ringWidth,
          borderColor:
            ring === "unread"
              ? Accent
              : ring === "seen"
                ? theme.seenRing
                : "transparent",
        },
        style,
      ]}
    >
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          backgroundColor: solidBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontSize: Math.max(13, Math.round(inner * 0.38)),
            fontWeight: "700",
            color: theme.label,
          }}
        >
          {initials}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignItems: "center",
    justifyContent: "center",
  },
});
