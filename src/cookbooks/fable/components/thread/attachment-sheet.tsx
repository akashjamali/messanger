import { BlurView } from "expo-blur";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { SymbolView } from "expo-symbols";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";

import { EASE_OUT } from "../../constants/motion";
import { Accent, Radius, Space, Type } from "../../constants/theme";
import { useTheme } from "../../hooks/use-theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelectImage: (uri: string) => void;
};

export function AttachmentSheet({ visible, onClose, onSelectImage }: Props) {
  const theme = useTheme();
  const scheme = useColorScheme();

  const handlePickFromGallery = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onClose();
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please enable photo library access to send pictures from your gallery.",
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0]?.uri;
        if (uri) {
          onSelectImage(uri);
        }
      }
    } catch (error) {
      console.warn("Failed to pick image from gallery:", error);
    }
  };

  const handlePickFromFileManager = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onClose();
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/*"],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0]?.uri;
        if (uri) {
          onSelectImage(uri);
        }
      }
    } catch (error) {
      console.warn("Failed to pick file from file manager:", error);
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
            accessibilityLabel="Close attachment picker"
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

        <View style={styles.sheetOverlay} pointerEvents="box-none">
          <Animated.View
            entering={FadeInDown.duration(260).easing(EASE_OUT.factory())}
            exiting={FadeOut.duration(180)}
            style={[
              styles.sheetCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.hairline,
              },
            ]}
          >
            <View style={styles.indicator} />
            <Text style={[Type.name, styles.title, { color: theme.label }]}>
              Send Image
            </Text>
            <Text
              style={[
                Type.caption,
                styles.subtitle,
                { color: theme.secondary },
              ]}
            >
              Choose an image from your gallery or file manager
            </Text>

            <View style={styles.optionsList}>
              {/* Photo Gallery Option */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose from Gallery"
                hitSlop={6}
                onPress={handlePickFromGallery}
                style={({ pressed }) => [
                  styles.optionRow,
                  {
                    backgroundColor: pressed ? theme.chip : theme.bg,
                    borderColor: theme.hairline,
                  },
                ]}
              >
                <View
                  style={[
                    styles.iconBox,
                    { backgroundColor: "rgba(0, 122, 255, 0.12)" },
                  ]}
                >
                  <SymbolView
                    name="photo.on.rectangle"
                    size={22}
                    tintColor={Accent}
                  />
                </View>
                <View style={styles.optionContent}>
                  <Text
                    style={[
                      Type.name,
                      styles.optionTitle,
                      { color: theme.label },
                    ]}
                  >
                    Photo Gallery
                  </Text>
                  <Text
                    style={[
                      Type.caption,
                      styles.optionSubtitle,
                      { color: theme.secondary },
                    ]}
                  >
                    Choose photos from library
                  </Text>
                </View>
                <SymbolView
                  name="chevron.right"
                  size={15}
                  tintColor={theme.secondary}
                />
              </Pressable>

              {/* File Manager Option */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose from File Manager"
                hitSlop={6}
                onPress={handlePickFromFileManager}
                style={({ pressed }) => [
                  styles.optionRow,
                  {
                    backgroundColor: pressed ? theme.chip : theme.bg,
                    borderColor: theme.hairline,
                  },
                ]}
              >
                <View
                  style={[
                    styles.iconBox,
                    { backgroundColor: "rgba(255, 149, 0, 0.12)" },
                  ]}
                >
                  <SymbolView name="folder" size={22} tintColor="#FF9500" />
                </View>
                <View style={styles.optionContent}>
                  <Text
                    style={[
                      Type.name,
                      styles.optionTitle,
                      { color: theme.label },
                    ]}
                  >
                    File Manager
                  </Text>
                  <Text
                    style={[
                      Type.caption,
                      styles.optionSubtitle,
                      { color: theme.secondary },
                    ]}
                  >
                    Browse files & device storage
                  </Text>
                </View>
                <SymbolView
                  name="chevron.right"
                  size={15}
                  tintColor={theme.secondary}
                />
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              hitSlop={6}
              onPress={onClose}
              style={[
                styles.cancelButton,
                { backgroundColor: theme.chip, borderColor: theme.hairline },
              ]}
            >
              <Text
                style={[
                  Type.name,
                  styles.cancelText,
                  { color: theme.label },
                ]}
              >
                Cancel
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: Space[3],
    paddingBottom: Space[6],
  },
  sheetCard: {
    borderRadius: Radius.card,
    borderWidth: 1,
    padding: Space[4],
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
  },
  indicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(128, 128, 128, 0.35)",
    marginBottom: Space[3],
  },
  title: {
    fontSize: 19,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: Space[4],
    textAlign: "center",
  },
  optionsList: {
    width: "100%",
    gap: Space[2],
    marginBottom: Space[4],
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Space[3],
    borderRadius: Radius.bubble,
    borderWidth: 1,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Space[3],
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    marginBottom: 2,
  },
  optionSubtitle: {
    fontSize: 12,
  },
  cancelButton: {
    width: "100%",
    paddingVertical: Space[3],
    borderRadius: Radius.bubble,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 15,
  },
});
