import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Network from "expo-network";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Glass } from "../components/ui/glass";
import { GlassButton } from "../components/ui/glass-button";
import { EASE_OUT } from "../constants/motion";
import { Accent } from "../constants/theme";
import { useFable } from "../data/store";
import { useTheme } from "../hooks/use-theme";
import { useRouterChatStore } from "../../../store/useRouterChatStore";
import { RouterAuthModal } from "../components/ui/router-auth-modal";

export default function Settings() {
  const theme = useTheme();
  const preference = useFable((state) => state.theme);

  const routerIP = useRouterChatStore((s) => s.routerIP);
  const isAuthenticated = useRouterChatStore((s) => s.isAuthenticated);
  const isSMSSupported = useRouterChatStore((s) => s.isSMSSupported);
  const deviceInfo = useRouterChatStore((s) => s.deviceInfo);
  const checkNetworkAndRouter = useRouterChatStore(
    (s) => s.checkNetworkAndRouter,
  );
  const disconnectFromRouter = useRouterChatStore((s) => s.disconnectFromRouter);

  const [page, setPage] = useState<"settings" | "connections">("settings");
  const [modalVisible, setModalVisible] = useState(false);

  const [networkInfo, setNetworkInfo] = useState<{
    name: string;
    type: string;
    ip: string;
    isConnected: boolean;
  }>({
    name: "Checking network...",
    type: "WIFI",
    ip: "",
    isConnected: true,
  });

  useEffect(() => {
    let active = true;

    async function updateNetwork() {
      try {
        const [state, ip] = await Promise.all([
          Network.getNetworkStateAsync(),
          Network.getIpAddressAsync().catch(() => ""),
        ]);
        if (!active) return;

        let name = "Not Connected";
        if (state.isConnected) {
          if (state.type === Network.NetworkStateType.WIFI) {
            name = ip && ip !== "0.0.0.0" ? `Wi-Fi (${ip})` : "Wi-Fi";
          } else if (state.type === Network.NetworkStateType.CELLULAR) {
            name = "Cellular Data";
          } else if (state.type === Network.NetworkStateType.ETHERNET) {
            name = ip && ip !== "0.0.0.0" ? `Ethernet (${ip})` : "Ethernet";
          } else if (state.type === Network.NetworkStateType.VPN) {
            name = "VPN Network";
          } else {
            name =
              ip && ip !== "0.0.0.0" ? `Connected (${ip})` : "Connected Network";
          }
        }

        setNetworkInfo({
          name,
          type: String(state.type || "WIFI"),
          ip: ip && ip !== "0.0.0.0" ? ip : "",
          isConnected: Boolean(state.isConnected),
        });
      } catch (err) {
        console.warn("Failed to get network state:", err);
      }
    }

    void updateNetwork();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (page !== "connections") return;
    void checkNetworkAndRouter();
    const interval = setInterval(() => {
      void checkNetworkAndRouter();
    }, 3000);
    return () => clearInterval(interval);
  }, [page, checkNetworkAndRouter]);

  const rawSignal = deviceInfo?.signalBar;
  const signalBar =
    rawSignal !== undefined ? rawSignal : isAuthenticated ? 4 : undefined;
  const signalColor =
    signalBar === undefined
      ? theme.secondary
      : signalBar >= 4
        ? "#34C759" // 4-5 means green
        : signalBar >= 2
          ? "#FFCC00" // 3-2 means yellow
          : "#FF3B30"; // 1 means red

  const rawBattery = deviceInfo?.batteryPercent;
  const isCharging = Boolean(deviceInfo?.isBatteryCharging);
  const batteryPercent =
    rawBattery !== undefined ? rawBattery : isAuthenticated ? 100 : undefined;
  const batterySymbol: SFSymbol = isCharging
    ? "battery.100.bolt"
    : batteryPercent === undefined
      ? "battery.100"
      : batteryPercent >= 80
        ? "battery.100"
        : batteryPercent >= 50
          ? "battery.75"
          : batteryPercent >= 25
            ? "battery.50"
            : "battery.25";

  const batteryText =
    batteryPercent !== undefined
      ? `${batteryPercent}%${isCharging ? " (Charging)" : ""}`
      : "100% (AC Power)";

  const isDataActive =
    deviceInfo?.isDataConnected ??
    (deviceInfo?.pppStatus === "ppp_connected" || isAuthenticated);
  const dataColor = isDataActive ? "#34C759" : "#FF3B30";

  const networkSymbol: SFSymbol =
    networkInfo.type === String(Network.NetworkStateType.CELLULAR)
      ? "antenna.radiowaves.left.and.right"
      : !networkInfo.isConnected
        ? "wifi.slash"
        : "wifi";

  if (page === "connections") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <ScrollView
          style={{ flex: 1, backgroundColor: theme.bg }}
          contentContainerStyle={{ padding: 24, paddingTop: 28, paddingBottom: 48 }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
              marginBottom: 28,
            }}
          >
            <GlassButton
              symbol="chevron.left"
              iconSize={17}
              accessibilityLabel="Back to settings"
              onPress={() => {
                Haptics.selectionAsync();
                setPage("settings");
              }}
            />
            <Text
              style={{
                flex: 1,
                fontSize: 26,
                fontWeight: "600",
                color: theme.label,
              }}
            >
              Connections
            </Text>
            <GlassButton
              symbol="xmark"
              accessibilityLabel="Close connections"
              onPress={() => router.back()}
            />
          </View>

          {/* Connections Content */}
          <Animated.View
            entering={FadeInDown.duration(280).easing(EASE_OUT.factory())}
          >
            <Text style={{ fontSize: 13, color: theme.secondary, marginBottom: 12 }}>
              NETWORK STATUS
            </Text>

            <Glass style={{ borderRadius: 26, overflow: "hidden" }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Connected Network: ${networkInfo.name}`}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setModalVisible(true);
                }}
                style={({ pressed }) => ({
                  padding: 20,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: pressed ? theme.rowPressed : "transparent",
                  borderRadius: 26,
                })}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: theme.chip,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <SymbolView name={networkSymbol} size={22} tintColor={Accent} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 13, color: theme.secondary, marginBottom: 2 }}>
                      {networkInfo.isConnected ? "Connected Network" : "Network Status"}
                    </Text>
                    <Text style={{ fontSize: 17, fontWeight: "600", color: theme.label }}>
                      {networkInfo.name}
                    </Text>
                  </View>
                </View>
                <SymbolView name="chevron.right" size={16} tintColor={theme.secondary} />
              </Pressable>
            </Glass>

            {/* Router Status Details */}
            <View style={{ marginTop: 20, gap: 12 }}>
              <Glass style={{ borderRadius: 20, padding: 16 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 14, color: theme.secondary }}>Gateway IP</Text>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: theme.label }}>
                    {routerIP || "192.168.2.1"}
                  </Text>
                </View>
                <View
                  style={{
                    height: 1,
                    backgroundColor: theme.hairline,
                    marginVertical: 12,
                  }}
                />
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: theme.secondary,
                      flexShrink: 0,
                    }}
                  >
                    SMS Support
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: !isSMSSupported ? "#FF9500" : "#34C759",
                      textAlign: "right",
                      flex: 1,
                    }}
                  >
                    {!isSMSSupported
                      ? "Device unsupported for SMS"
                      : "Supported (SIM Ready)"}
                  </Text>
                </View>
                <View
                  style={{
                    height: 1,
                    backgroundColor: theme.hairline,
                    marginVertical: 12,
                  }}
                />
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 14, color: theme.secondary }}>Session Status</Text>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: isAuthenticated ? "#34C759" : Accent,
                    }}
                  >
                    {isAuthenticated ? "Authenticated" : "Not Logged In"}
                  </Text>
                </View>

                {isAuthenticated && (
                  <>
                    <View
                      style={{
                        height: 1,
                        backgroundColor: theme.hairline,
                        marginVertical: 12,
                      }}
                    />
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ fontSize: 14, color: theme.secondary }}>
                        Live Signal
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <SymbolView
                          name="antenna.radiowaves.left.and.right"
                          size={15}
                          tintColor={signalColor}
                        />
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "600",
                            color: signalColor,
                          }}
                        >
                          {signalBar !== undefined
                            ? `${signalBar} / 5 Bars`
                            : "Detecting..."}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={{
                        height: 1,
                        backgroundColor: theme.hairline,
                        marginVertical: 12,
                      }}
                    />
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ fontSize: 14, color: theme.secondary }}>
                        Live Battery
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <SymbolView
                          name={batterySymbol}
                          size={16}
                          tintColor={
                            batteryPercent !== undefined && batteryPercent <= 20
                              ? "#FF3B30"
                              : theme.label
                          }
                        />
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "600",
                            color: theme.label,
                          }}
                        >
                          {batteryText}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={{
                        height: 1,
                        backgroundColor: theme.hairline,
                        marginVertical: 12,
                      }}
                    />
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ fontSize: 14, color: theme.secondary }}>
                        Cellular Data
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <SymbolView
                          name="arrow.up.arrow.down"
                          size={14}
                          tintColor={dataColor}
                        />
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "600",
                            color: dataColor,
                          }}
                        >
                          {isDataActive ? "Connected (Active)" : "Disconnected"}
                        </Text>
                      </View>
                    </View>
                  </>
                )}
              </Glass>

              {isAuthenticated && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Disconnect from Router"
                  onPress={async () => {
                    await disconnectFromRouter();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  style={({ pressed }) => ({
                    padding: 16,
                    borderRadius: 20,
                    backgroundColor: theme.chip,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ color: "#FF3B30", fontSize: 15, fontWeight: "600" }}>
                    Disconnect / Logout
                  </Text>
                </Pressable>
              )}
            </View>
          </Animated.View>
        </ScrollView>

        <RouterAuthModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 24, paddingTop: 28, paddingBottom: 48 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 16,
          marginBottom: 28,
        }}
      >
        <Text
          style={{
            flex: 1,
            fontSize: 26,
            fontWeight: "600",
            color: theme.label,
          }}
        >
          Make it yours.
        </Text>
        <GlassButton
          symbol="xmark"
          accessibilityLabel="Close settings"
          onPress={() => router.back()}
        />
      </View>
      <Text style={{ fontSize: 13, color: theme.secondary, marginBottom: 12 }}>
        APPEARANCE
      </Text>
      <Glass style={{ flexDirection: "row", padding: 6, borderRadius: 26 }}>
        {(["system", "light", "dark"] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ checked: preference === value }}
            accessibilityLabel={`${value} appearance`}
            onPress={() => useFable.getState().setTheme(value)}
            style={{
              flex: 1,
              paddingVertical: 16,
              alignItems: "center",
              borderRadius: 22,
              backgroundColor:
                preference === value ? theme.chip : "transparent",
            }}
          >
            <Text
              style={{ fontSize: 14, fontWeight: "500", color: theme.label }}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </Text>
          </Pressable>
        ))}
      </Glass>

      {/* Connection Menu Item - Positioned exactly below Appearance */}
      <Text style={{ fontSize: 13, color: theme.secondary, marginTop: 28, marginBottom: 12 }}>
        CONNECTION
      </Text>
      <Glass style={{ borderRadius: 26, overflow: "hidden" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Connection settings"
          onPress={() => {
            Haptics.selectionAsync();
            setPage("connections");
          }}
          style={({ pressed }) => ({
            paddingHorizontal: 20,
            paddingVertical: 18,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: pressed ? theme.rowPressed : "transparent",
            borderRadius: 26,
          })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: theme.chip,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <SymbolView name={networkSymbol} size={18} tintColor={Accent} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: "500", color: theme.label }}>
              Connection
            </Text>
          </View>
          <SymbolView name="chevron.right" size={15} tintColor={theme.secondary} />
        </Pressable>
      </Glass>

      <Text
        style={{
          marginTop: 28,
          fontSize: 17,
          fontWeight: "600",
          color: theme.label,
        }}
      >
        Your people, a little closer.
      </Text>
      <Text
        style={{
          marginTop: 12,
          fontSize: 15,
          lineHeight: 22,
          color: theme.secondary,
        }}
      >
        Fable is a local chat preview. Sample messages stay on this device.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          Alert.alert(
            "Start fresh?",
            "Reset the sample conversations in Fable?",
            [
              { text: "Keep them", style: "cancel" },
              {
                text: "Reset preview",
                style: "destructive",
                onPress: () => {
                  useFable.getState().reset();
                  router.back();
                },
              },
            ],
          )
        }
        style={{ paddingVertical: 24 }}
      >
        <Text style={{ color: theme.label, fontSize: 15 }}>
          Reset sample conversations
        </Text>
      </Pressable>
    </ScrollView>
  );
}
