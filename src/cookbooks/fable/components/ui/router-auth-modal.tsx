import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";

import { EASE_OUT } from "../../constants/motion";
import { Accent, Radius, Space, Type } from "../../constants/theme";
import { useTheme } from "../../hooks/use-theme";
import { useRouterChatStore } from "../../../../store/useRouterChatStore";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function RouterAuthModal({ visible, onClose, onSuccess }: Props) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const networkName =
    useRouterChatStore((state) => state.networkName) || "Jazz 4G Router";
  const routerIP =
    useRouterChatStore((state) => state.routerIP) || "192.168.2.1";
  const connectToRouter = useRouterChatStore((state) => state.connectToRouter);

  const handleLogin = async () => {
    if (!password.trim()) {
      setErrorMessage("Password is required.");
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      await connectToRouter(username.trim(), password.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPassword("");
      onClose();
      onSuccess?.();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage(
        err.message || "Authentication failed. Check your admin password.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={StyleSheet.absoluteFill}>
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={StyleSheet.absoluteFill}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close authentication modal"
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          >
            <BlurView
              intensity={30}
              tint={scheme === "dark" ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          </Pressable>
        </Animated.View>

        <View style={styles.modalOverlay} pointerEvents="box-none">
          <Animated.View
            entering={FadeInDown.duration(260).easing(EASE_OUT.factory())}
            exiting={FadeOut.duration(180)}
            style={[
              styles.modalCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.hairline,
              },
            ]}
          >
            <Text
              style={[
                Type.name,
                styles.title,
                { color: theme.label, fontSize: 20 },
              ]}
            >
              Router Authentication
            </Text>
            <Text
              style={[
                Type.caption,
                styles.subtitle,
                { color: theme.secondary, fontSize: 13 },
              ]}
            >
              Connect to {networkName} ({routerIP}) to send SMS
            </Text>

            {/* Admin Input */}
            <Text
              style={[
                Type.caption,
                styles.inputLabel,
                { color: theme.secondary },
              ]}
            >
              ADMIN USERNAME
            </Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="admin"
              placeholderTextColor={theme.placeholder}
              autoCapitalize="none"
              style={[
                styles.modalInput,
                {
                  backgroundColor: theme.bg,
                  color: theme.label,
                  borderColor: theme.hairline,
                },
              ]}
            />

            {/* Password Input */}
            <Text
              style={[
                Type.caption,
                styles.inputLabel,
                { color: theme.secondary },
              ]}
            >
              ADMIN PASSWORD
            </Text>
            <TextInput
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="Enter router password"
              placeholderTextColor={theme.placeholder}
              secureTextEntry
              autoCapitalize="none"
              onSubmitEditing={handleLogin}
              style={[
                styles.modalInput,
                {
                  backgroundColor: theme.bg,
                  color: theme.label,
                  borderColor: errorMessage ? "#FF3B30" : theme.hairline,
                },
              ]}
            />

            {Boolean(errorMessage) && (
              <Text style={styles.errorText}>{errorMessage}</Text>
            )}

            {/* Actions */}
            <View style={styles.buttonRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={onClose}
                disabled={loading}
                style={({ pressed }) => [
                  styles.modalBtn,
                  {
                    backgroundColor: theme.chip,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text
                  style={[Type.body, styles.btnText, { color: theme.label }]}
                >
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Login and Connect"
                onPress={handleLogin}
                disabled={loading}
                style={({ pressed }) => [
                  styles.modalBtn,
                  {
                    backgroundColor: Accent,
                    opacity: pressed || loading ? 0.75 : 1,
                  },
                ]}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text
                    style={[Type.body, styles.btnText, { color: "#FFFFFF" }]}
                  >
                    Connect
                  </Text>
                )}
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Space[4],
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Space[4],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 8,
  },
  title: {
    marginBottom: 4,
  },
  subtitle: {
    marginBottom: Space[4],
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  modalInput: {
    height: 44,
    borderRadius: Radius.bubble,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
    marginBottom: Space[3],
  },
  errorText: {
    color: "#FF3B30",
    fontSize: 12,
    marginBottom: Space[2],
  },
  buttonRow: {
    flexDirection: "row",
    gap: Space[2],
    marginTop: Space[3],
  },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.bubble,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
