import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassButton } from "../components/ui/glass-button";
import { getPerson } from "../data/people";
import { NotFound } from "../../NotFound";

export default function Photo() {
  const { id, uri } = useLocalSearchParams<{ id?: string; uri?: string }>();
  const insets = useSafeAreaInsets();
  if (!id && !uri) return <NotFound home="/fable" />;
  const person = id ? getPerson(id) : null;
  const source = uri ? { uri } : person?.avatar;
  if (!source) return <NotFound home="/fable" />;
  return (
    <View style={{ flex: 1, backgroundColor: "#101012" }}>
      <StatusBar style="light" />
      <Image source={source} contentFit="contain" style={{ flex: 1 }} />
      <View style={{ position: "absolute", right: 20, top: insets.top + 12 }}>
        <GlassButton
          symbol="xmark"
          tint="#FFFFFF"
          accessibilityLabel="Close photo"
          onPress={() => router.back()}
        />
      </View>
    </View>
  );
}
