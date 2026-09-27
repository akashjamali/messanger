import { cssInterop } from "nativewind";
import { GlassContainer, GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { StatusBar } from "expo-status-bar";
import { Button, Divider, GlassEffectContainer, Host, HStack, Image as SwiftImage, Label, Menu, Picker, TextField, type TextFieldRef } from "@expo/ui/swift-ui";
import { buttonBorderShape, buttonStyle, controlSize, foregroundStyle, frame, glassEffect, labelStyle, labelsHidden, menuIndicator, padding, pickerStyle, tag, textFieldStyle } from "@expo/ui/swift-ui/modifiers";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Dimensions,
  Easing,
  Image,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { memo, startTransition, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { alertMessage, ensureAlerts } from "./src/alerts";
import { clearSession, loadChatCache, loadSeenIds, loadSession, saveChatCache, saveSeenIds, saveSession } from "./src/deviceSession";
import { hapticDeleteAsk, hapticDeleteConfirm, hapticReceive, hapticSelection, hapticSend, playMessageSound } from "./src/feedback";
import { loadPhoneBook, lookupName, samePhone, savePhoneContact, type SavedContact } from "./src/phoneBook";
import {
  loginToRouter,
  fetchRouterMessages,
  markRouterMessagesRead,
  deleteRouterMessage,
  sendRouterMessage,
  formatRouterDate,
  decodeUCS2,
  suggestRouters,
  SUGGESTED_NETWORKS,
  fetchRouterStatus,
  fetchDeviceSettings,
  saveWifiSettings,
  setWifiEnabled,
  fetchLiveLink,
  fetchWifiUsers,
  setWifiUserBlocked,
  fetchWifiSetup,
  fetchDeviceControls,
  saveDualAccess,
  saveRadioSettings,
  setBlacklistEnabled,
  startWps,
  setSimPin,
  savePowerSettings,
  rebootDevice,
  shutdownDevice,
  resetFactorySettings,
  isPhoneGateway,
  type RawRouterMessage,
  type RouterLiveStatus,
  type DeviceSettings,
  type LiveLink,
  type WifiUser,
  type WifiSetup,
  type DeviceControls,
} from "./src/services/routerApi";
import "./src/styles/global.css";

cssInterop(GlassView, { className: "style" });

const GRAY = "#8E8E93";
const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
const BAR_GAP = 12;

function nativeGlassStyle(style: "clear" | "regular" | "none") {
  return { style, animate: false, animationDuration: 0 };
}

const GLASS_EDGE = {
  borderCurve: "continuous" as const,
  borderWidth: 0,
  shadowOpacity: 0,
};

function Chrome({
  children,
  className,
  style,
  effect = "regular",
  plain = false,
  interactive = true,
  colorScheme,
}: {
  children?: ReactNode;
  className?: string;
  style?: any;
  effect?: "clear" | "regular";
  plain?: boolean;
  interactive?: boolean;
  colorScheme?: "dark" | "light";
}) {
  const systemDark = useColorScheme() === "dark";
  const dark = colorScheme ? colorScheme === "dark" : systemDark;
  const glassOnly = plain
    ? [{ borderCurve: "continuous" as const, backgroundColor: "transparent", borderWidth: 0 }, style]
    : [GLASS_EDGE, style];

  if (isGlassEffectAPIAvailable()) {
    return (
      <GlassView
        isInteractive={interactive}
        glassEffectStyle={nativeGlassStyle(effect)}
        colorScheme={dark ? "dark" : "light"}
        className={plain ? undefined : className}
        style={glassOnly}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View
      className={plain ? undefined : className}
      style={
        plain
          ? [{ borderCurve: "continuous" as const, backgroundColor: "transparent", borderWidth: 0 }, style]
          : [
              GLASS_EDGE,
              {
                backgroundColor: dark ? "#2C2C2E" : "#FFFFFF",
                borderWidth: 0,
              },
              style,
            ]
      }
    >
      {children}
    </View>
  );
}

function GlassPress({
  children,
  onPress,
  hitSlop = 10,
  disabled,
}: {
  children: ReactNode;
  onPress?: () => void;
  hitSlop?: number;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        if (!onPress) return;
        onPress();
        hapticSelection();
      }}
      disabled={disabled}
      hitSlop={hitSlop}
    >
      {children}
    </Pressable>
  );
}

function signalTint(level: number) {
  if (level >= 3) return "#30D158";
  if (level >= 1) return "#FFCC00";
  return "#FF3B30";
}

function IosSignal({ level }: { level: number }) {
  const active = level >= 5 ? 4 : Math.max(0, Math.min(4, Math.round(level)));
  const color = signalTint(level);
  const heights = [4, 7, 10, 13];
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", height: 14, gap: 2 }}>
      {heights.map((height, index) => (
        <View
          key={height}
          style={{
            width: 3,
            height,
            borderRadius: 1,
            backgroundColor: color,
            opacity: index < active ? 1 : 0.28,
          }}
        />
      ))}
    </View>
  );
}

function Icon({
  name,
  size,
  color,
  weight = "regular",
  style,
}: {
  name: SFSymbol;
  size: number;
  color: string;
  weight?: "regular" | "medium" | "semibold" | "bold";
  style?: any;
}) {
  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <SymbolView name={name} size={size} tintColor={color} weight={weight as any} style={{ width: size, height: size }} />
    </View>
  );
}

type InboxFilter = "messages" | "spam" | "deleted";

type ChatMessage = {
  id: string;
  text: string;
  outgoing: boolean;
  time: string;
};

type Chat = {
  id: string;
  name: string;
  phone: string;
  shortName: string;
  initials: string;
  preview: string;
  time: string;
  dayLabel: string;
  service: string;
  folder: InboxFilter;
  avatarBg?: string;
  avatarUrl?: string;
  unread?: boolean;
  messages: ChatMessage[];
};

const GREEN = "#30D158";
const DELETE_WIDTH = 88;

function inboxStamp(list: Chat[]) {
  let stamp = "";
  for (const chat of list) {
    const last = chat.messages[chat.messages.length - 1];
    stamp += `${chat.id}\u0001${chat.folder}\u0001${chat.unread ? 1 : 0}\u0001${chat.preview}\u0001${chat.time}\u0001${chat.messages.length}\u0001${last?.id ?? ""}\u0002`;
  }
  return stamp;
}

type RowActions = {
  open: (id: string) => void;
  reveal: (id: string) => void;
  remove: (id: string) => void;
};

const DEFAULT_CHATS: Chat[] = [];

function convertRouterMessagesToChats(raw: RawRouterMessage[]): Chat[] {
  const groups: { [sender: string]: RawRouterMessage[] } = {};
  for (const m of raw) {
    const sender = m.number || "Unknown";
    if (!groups[sender]) groups[sender] = [];
    groups[sender].push(m);
  }

  const result: Chat[] = [];
  for (const sender in groups) {
    const msgs = groups[sender];
    const latest = msgs[0];
    const { time, dayLabel } = formatRouterDate(latest.date);
    const decoded = decodeUCS2(latest.content);

    let initials = sender.slice(0, 2).toUpperCase();
    if (sender.toLowerCase().includes("zong")) initials = "ZG";
    else if (sender.toLowerCase().includes("jazz")) initials = "JZ";
    else if (sender.toLowerCase().includes("telenor")) initials = "TN";
    else if (sender.toLowerCase().includes("ufone")) initials = "UF";
    else if (sender.startsWith("+92")) initials = sender.slice(3, 5);

    result.push({
      id: `chat-${sender}`,
      name: sender,
      phone: sender,
      shortName: sender.length > 14 ? sender.slice(0, 12) + "..." : sender,
      initials: initials,
      avatarBg: "#4C4863",
      preview: decoded,
      time: time,
      dayLabel: dayLabel,
      service: "Text Message · SMS",
      folder: "messages",
      unread: latest.tag === "0",
      messages: msgs
        .map((m) => {
          const d = formatRouterDate(m.date);
          return {
            id: m.id,
            text: decodeUCS2(m.content),
            outgoing: m.tag === "2" || m.tag === "3",
            time: d.time,
          };
        })
        .reverse(),
    });
  }
  return result;
}

function Avatar({
  initials,
  size = 50,
  bg,
  imageUri,
}: {
  initials: string;
  size?: number;
  bg?: string;
  imageUri?: string;
}) {
  const dark = useColorScheme() === "dark";
  const fill = bg ?? (dark ? "#FFFFFF" : "#000000");
  const mark = dark ? "#000000" : "#FFFFFF";
  const containerStyle = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    maxWidth: size,
    maxHeight: size,
    borderRadius: size / 2,
    overflow: "hidden" as const,
    backgroundColor: fill,
    flexShrink: 0,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };

  if (imageUri) {
    return (
      <View style={containerStyle}>
        <Image
          source={{ uri: imageUri }}
          style={{ width: size, height: size }}
          resizeMode="cover"
        />
      </View>
    );
  }

  const isEmoji = initials.length > 0 && /\p{Extended_Pictographic}/u.test(initials);

  return (
    <View style={containerStyle}>
      <Text
        style={{
          color: mark,
          fontSize: isEmoji ? Math.round(size * 0.52) : Math.round(size * 0.4),
          fontWeight: "600",
          letterSpacing: -0.3,
          textAlign: "center",
          includeFontPadding: false,
        }}
      >
        {initials}
      </Text>
    </View>
  );
}

function IMessageBubble({
  text,
  outgoing,
  dark,
  pageBg,
}: {
  text: string;
  outgoing: boolean;
  dark: boolean;
  pageBg: string;
}) {
  const bubbleColor = outgoing ? (dark ? "#FFFFFF" : "#000000") : dark ? "#2C2C2E" : "#E9E9EB";
  const textColor = outgoing ? (dark ? "#000000" : "#FFFFFF") : dark ? "#FFFFFF" : "#000000";

  if (outgoing) {
    return (
      <View
        style={{
          alignSelf: "flex-end",
          marginRight: 16,
          marginVertical: 4,
          maxWidth: "75%",
          position: "relative",
        }}
      >
        <View
          style={{
            backgroundColor: bubbleColor,
            borderRadius: 18,
            paddingHorizontal: 14,
            paddingVertical: 8,
            minHeight: 36,
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: textColor,
              fontSize: 17,
              lineHeight: 22,
              letterSpacing: -0.4,
            }}
          >
            {text}
          </Text>
        </View>

        {/* Outer tail shape */}
        <View
          style={{
            position: "absolute",
            right: -6,
            bottom: 0,
            width: 20,
            height: 20,
            backgroundColor: bubbleColor,
            borderBottomLeftRadius: 16,
            borderBottomRightRadius: 4,
          }}
        />
        {/* Inner mask curving the tail */}
        <View
          style={{
            position: "absolute",
            right: -10,
            bottom: 0,
            width: 10,
            height: 20,
            backgroundColor: pageBg,
            borderBottomLeftRadius: 10,
          }}
        />
      </View>
    );
  }

  return (
    <View
      style={{
        alignSelf: "flex-start",
        marginLeft: 16,
        marginVertical: 4,
        maxWidth: "75%",
        position: "relative",
      }}
    >
      <View
        style={{
          backgroundColor: bubbleColor,
          borderRadius: 18,
          paddingHorizontal: 14,
          paddingVertical: 8,
          minHeight: 36,
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: textColor,
            fontSize: 17,
            lineHeight: 22,
            letterSpacing: -0.4,
          }}
        >
          {text}
        </Text>
      </View>

      {/* Outer tail shape */}
      <View
        style={{
          position: "absolute",
          left: -6,
          bottom: 0,
          width: 20,
          height: 20,
          backgroundColor: bubbleColor,
          borderBottomRightRadius: 16,
          borderBottomLeftRadius: 4,
        }}
      />
      {/* Inner mask curving the tail */}
      <View
        style={{
          position: "absolute",
          left: -10,
          bottom: 0,
          width: 10,
          height: 20,
          backgroundColor: pageBg,
          borderBottomRightRadius: 10,
        }}
      />
    </View>
  );
}

interface WifiNetwork {
  ssid: string;
  security?: string;
  signal: number;
  secured: boolean;
  ip: string;
  subtext?: string;
}

function NetworkRow({
  ssid,
  subtext,
  connected = false,
  onPress,
  showDivider = true,
}: {
  ssid: string;
  subtext?: string;
  connected?: boolean;
  onPress?: () => void;
  showDivider?: boolean;
}) {
  const dark = useColorScheme() === "dark";
  const ink = dark ? "#FFFFFF" : "#000000";
  const line = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  return (
    <View>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.networkRow, pressed && { opacity: 0.55 }]}>
        <View style={styles.networkTitleWrapper}>
          <Text style={[styles.networkNameText, { color: ink }]} numberOfLines={1} ellipsizeMode="tail">
            {ssid}
          </Text>
          {subtext ? (
            <Text style={styles.networkSubtextText} numberOfLines={1} ellipsizeMode="tail">
              {subtext}
            </Text>
          ) : null}
        </View>
        {connected ? <Icon name="checkmark.circle.fill" size={22} color="#0A84FF" weight="semibold" /> : null}
      </Pressable>
      {showDivider ? <View style={[styles.networkRowDivider, { backgroundColor: line }]} /> : null}
    </View>
  );
}

function StatusLine({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  const dark = useColorScheme() === "dark";
  const ink = dark ? "#FFFFFF" : "#000000";
  return (
    <View>
      <View style={styles.networkRow}>
        <Text style={[styles.networkNameText, { color: ink }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.statusValue} numberOfLines={1} ellipsizeMode="tail">
          {value}
        </Text>
      </View>
      {last ? null : <View style={[styles.networkRowDivider, { backgroundColor: dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)" }]} />}
    </View>
  );
}

function LiveStats({ host, dark }: { host: string; dark: boolean }) {
  const [liveLink, setLiveLink] = useState<LiveLink | null>(null);
  const [rates, setRates] = useState({ send: 0, recv: 0 });
  const lastSample = useRef<{ tx: number; rx: number; at: number } | null>(null);
  const stamp = useRef("");

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const next = await fetchLiveLink(host);
      if (!alive || !next) return;
      const now = Date.now();
      const prev = lastSample.current;
      let send = next.txThrpt;
      let recv = next.rxThrpt;
      if (prev && now > prev.at && next.txBytes >= prev.tx && next.rxBytes >= prev.rx) {
        const seconds = (now - prev.at) / 1000;
        if (seconds > 0.2) {
          if (send <= 0) send = (next.txBytes - prev.tx) / seconds;
          if (recv <= 0) recv = (next.rxBytes - prev.rx) / seconds;
        }
      }
      lastSample.current = { tx: next.txBytes, rx: next.rxBytes, at: now };
      const nextStamp = `${formatRate(send)}|${formatRate(recv)}|${next.latencyMs}|${next.sim}|${next.battery}|${next.charging}|${next.dataOn}|${next.wifiOn}|${next.users}`;
      if (stamp.current === nextStamp) return;
      stamp.current = nextStamp;
      setLiveLink(next);
      setRates({ send, recv });
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [host]);

  return (
    <Chrome
      effect="regular"
      colorScheme={dark ? "dark" : "light"}
      style={[
        styles.groupedContainer,
        {
          backgroundColor: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
          borderWidth: 0,
          marginTop: 16,
        },
      ]}
    >
      <StatusLine label="Sending" value={liveLink ? formatRate(rates.send) : "—"} />
      <StatusLine label="Receiving" value={liveLink ? formatRate(rates.recv) : "—"} />
      <StatusLine label="Latency" value={liveLink ? `${liveLink.latencyMs} ms` : "—"} />
      <StatusLine label="SIM" value={liveLink?.sim || "—"} />
      <StatusLine label="Battery" value={liveLink?.battery ? `${liveLink.battery}%` : "—"} />
      <StatusLine label="Charging" value={liveLink ? (liveLink.charging ? "Charging" : "Not charging") : "—"} />
      <StatusLine label="Data" value={liveLink ? (liveLink.dataOn ? (rates.recv > 0 ? "On · receiving" : "On") : "Off") : "—"} />
      <StatusLine label="WiFi Status" value={liveLink ? (liveLink.wifiOn ? "On" : "Off") : "—"} />
      <StatusLine label="Current WiFi User" value={liveLink ? String(liveLink.users) : "—"} last />
    </Chrome>
  );
}

function WifiSettingsPage({
  deviceHost,
  deviceName,
  signalLevel = 0,
  onConnected,
  onDisconnect,
}: {
  deviceHost?: string | null;
  deviceName?: string | null;
  signalLevel?: number;
  onConnected: (chats: Chat[], ssid: string, ip?: string) => void;
  onDisconnect: () => void;
}) {
  const [suggestions, setSuggestions] = useState<RouterLiveStatus[]>([]);
  const [live, setLive] = useState<RouterLiveStatus | null>(null);
  const [statusNote, setStatusNote] = useState("Looking for a separate device…");
  const [picked, setPicked] = useState<WifiNetwork | null>(null);
  const [networkPassword, setNetworkPassword] = useState("");
  const [username, setUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const dark = useColorScheme() === "dark";
  const page = dark ? "#000000" : "#FFFFFF";
  const ink = dark ? "#FFFFFF" : "#000000";
  const line = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  const glassCard = { backgroundColor: "transparent" as const, overflow: "visible" as const };
  const [connectNote, setConnectNote] = useState("");
  const [connecting, setConnecting] = useState(false);
  const gatewayRef = useRef<string | null>(null);
  const scanStampRef = useRef("");
  const holdScanRef = useRef(false);
  const loadRef = useRef<() => Promise<void>>(async () => {});
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (event) => setKeyboardHeight(event.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const guarded = async () => {
      if (holdScanRef.current) return;
      const found = await suggestRouters();
      if (!alive) return;
      const stamp = found.map((item) => `${item.gateway}|${item.ssid}|${item.signalbar ?? ""}`).join("~");
      if (scanStampRef.current === stamp) return;
      scanStampRef.current = stamp;
      setSuggestions(found);
      const preferred =
        found.find((item) => item.gateway === deviceHost) ??
        found.find((item) => item.gateway === gatewayRef.current) ??
        found[0] ??
        null;
      if (preferred) {
        gatewayRef.current = preferred.gateway;
        setLive(preferred);
        setStatusNote("");
      } else if (deviceHost) {
        setLive(null);
        setStatusNote("Phone internet can stay as it is. The device link is waiting until that MiFi answers.");
      } else {
        setLive(null);
        setStatusNote("No device on this network yet. Suggested device is the MiFi at 192.168.2.1.");
      }
    };
    loadRef.current = guarded;
    guarded();
    const timer = setInterval(guarded, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [deviceHost]);

  const refresh = () => {
    spin.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: true }).start();
    gatewayRef.current = null;
    scanStampRef.current = "";
    setLive(null);
    setStatusNote("Finding the MiFi…");
    loadRef.current();
  };

  const chooseNetwork = (ssid: string, ip: string, status: RouterLiveStatus | null) => {
    holdScanRef.current = true;
    if (status) setLive(status);
    gatewayRef.current = ip;
    setPicked({
      ssid,
      signal: Number(status?.signalbar) || 0,
      secured: true,
      ip,
    });
    setNetworkPassword("");
    setUsername("");
    setAdminPassword("");
    setConnectNote("");
    setConnecting(false);
  };

  const connectDevice = async () => {
    if (connecting || !picked) return;
    const host = picked.ip;
    if (isPhoneGateway(host)) {
      setConnectNote("That is the phone network. Pick the device network.");
      return;
    }
    const devicePass = networkPassword;
    const user = username.trim();
    const adminPass = adminPassword;
    if (!devicePass || !user || !adminPass) {
      setConnectNote("Enter the device password, username, and password.");
      return;
    }
    holdScanRef.current = true;
    setConnecting(true);
    setConnectNote("Connecting…");
    try {
      const hosts = [host];
      let reached: string | null = null;
      let status: RouterLiveStatus | null = null;
      for (const candidate of hosts) {
        for (let attempt = 0; attempt < 2 && !status; attempt += 1) {
          status = await fetchRouterStatus(candidate, 7000);
          if (status) reached = candidate;
        }
        if (reached) break;
        status = null;
      }
      if (!reached) {
        setConnectNote("Home Wi-Fi cannot reach this device. Join the MiFi on the iPhone, then connect.");
        setConnecting(false);
        return;
      }
      let secret = adminPass;
      let loggedIn = await loginToRouter(reached, user, adminPass);
      if (!loggedIn) {
        loggedIn = await loginToRouter(reached, user, devicePass);
        if (loggedIn) secret = devicePass;
      }
      let msgs = await fetchRouterMessages(reached, 8000);
      if (msgs == null) msgs = await fetchRouterMessages(reached, 8000);
      if (msgs == null && !loggedIn) {
        setConnectNote("Device answered, but sign-in failed. Check the admin password.");
        setConnecting(false);
        return;
      }
      const name = status?.ssid || picked.ssid;
      await saveSession({ ip: reached, ssid: name, username: user, password: secret });
      ensureAlerts();
      onConnected(convertRouterMessagesToChats(msgs ?? []), name, reached);
      setConnectNote(msgs && msgs.length > 0 ? "Connected" : "Connected. No messages yet.");
      setConnecting(false);
      setTimeout(() => {
        holdScanRef.current = false;
        setPicked(null);
      }, 700);
    } catch {
      setConnectNote("Could not reach this device.");
      setConnecting(false);
    }
  };

  return (
    <View style={[styles.screenContainer, { backgroundColor: page }]}>
      <StatusBar style={dark ? "light" : "dark"} />
      <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: "transparent" }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, { paddingTop: 64 }]} keyboardShouldPersistTaps="handled">
          <Chrome
            effect="regular"
            colorScheme={dark ? "dark" : "light"}
            style={[
              styles.groupedContainer,
              {
                backgroundColor: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                borderWidth: 0,
              },
            ]}
          >
            <View style={styles.topContainerHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={[styles.wifiSquareIcon, { backgroundColor: ink, marginBottom: 0 }]}>
                  <Icon name="wifi" size={28} color={page} weight="semibold" />
                </View>
                <IosSignal level={live ? Number(live.signalbar) || 0 : signalLevel} />
              </View>
              <Text style={[styles.wifiHeaderTitle, { color: ink, marginTop: 14 }]}>Connections</Text>
              <Text style={styles.wifiHeaderDesc}>
                The app connects only to its own device network. It does not use the phone's mobile network. Messages come from the device you select.
              </Text>
              {deviceHost ? (
                <Pressable
                  onPress={() => {
                    onDisconnect();
                    hapticSelection();
                  }}
                  style={{ marginTop: 16, alignSelf: "flex-start" }}
                >
                  <Text style={{ color: "#FF3B30", fontSize: 17, fontWeight: "600", letterSpacing: -0.4 }}>Disconnect</Text>
                </Pressable>
              ) : null}
            </View>
          </Chrome>

          <LiveStats host={live?.gateway || deviceHost || "192.168.2.1"} dark={dark} />

          <Text style={styles.sectionHeaderTitle}>Suggestions</Text>
          <Chrome
            effect="regular"
            colorScheme={dark ? "dark" : "light"}
            style={[
              styles.groupedContainer,
              {
                backgroundColor: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                borderWidth: 0,
                marginBottom: 40,
              },
            ]}
          >
            {SUGGESTED_NETWORKS.map((network, idx) => {
              const found = suggestions.find((item) => item.gateway === network.ip);
              const name = found?.ssid || (deviceHost === network.ip && deviceName ? deviceName : network.name);
              return (
                <NetworkRow
                  key={network.ip}
                  ssid={name}
                  subtext="Tap to connect"
                  connected={deviceHost === network.ip}
                  onPress={() => chooseNetwork(name, network.ip, found ?? null)}
                  showDivider={idx < SUGGESTED_NETWORKS.length - 1}
                />
              );
            })}
          </Chrome>

          {live || signalLevel > 0 ? (
            <>
              <Text style={styles.sectionHeaderTitle}>Live signal</Text>
              <Chrome
                effect="regular"
                colorScheme={dark ? "dark" : "light"}
                style={[
                  styles.groupedContainer,
                  {
                    backgroundColor: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                    borderWidth: 0,
                    marginBottom: 40,
                  },
                ]}
              >
                <View style={[styles.networkRow, { justifyContent: "space-between" }]}>
                  <Text style={[styles.networkNameText, { color: ink }]}>Signal</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <IosSignal level={live ? Number(live.signalbar) || 0 : signalLevel} />
                    <Text style={styles.statusValue}>
                      {live?.rssi ? `${live.signalbar} / 5 · ${live.rssi} dBm` : `${live?.signalbar || signalLevel} / 5`}
                    </Text>
                  </View>
                </View>
                {live ? (
                  <>
                <StatusLine label="Network" value={[live.networkType, live.provider].filter(Boolean).join(" · ") || "—"} />
                <StatusLine
                  label="Internet"
                  value={live.connected ? (live.wanIp ? `Connected · ${live.wanIp}` : "Connected") : "Not connected"}
                />
                <StatusLine
                  label="Battery"
                  value={live.battery ? `${live.battery}%${live.charging ? " · Charging" : ""}` : "—"}
                  last
                />
                  </>
                ) : null}
              </Chrome>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={picked != null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !connecting && setPicked(null)}>
        <View style={[styles.popupBackdrop, keyboardHeight > 0 ? { justifyContent: "flex-end", paddingBottom: keyboardHeight + BAR_GAP } : null]}>
          <Chrome effect="regular" style={styles.glassPopup}>
            <Text style={[styles.popupTitle, { color: ink }]}>{picked?.ssid}</Text>
            <Text style={[styles.popupBody, { color: dark ? "rgba(235,235,245,0.7)" : "rgba(60,60,67,0.72)" }]}>Enter the device password, username, and password.</Text>
            <TextInput
              value={networkPassword}
              onChangeText={setNetworkPassword}
              placeholder="Device password"
              placeholderTextColor="#8E8E93"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              keyboardAppearance={dark ? "dark" : "light"}
              style={[styles.popupInput, { color: ink, backgroundColor: line }]}
            />
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="Username"
              placeholderTextColor="#8E8E93"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardAppearance={dark ? "dark" : "light"}
              style={[styles.popupInput, { color: ink, backgroundColor: line }]}
            />
            <TextInput
              value={adminPassword}
              onChangeText={setAdminPassword}
              placeholder="Password"
              placeholderTextColor="#8E8E93"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              keyboardAppearance={dark ? "dark" : "light"}
              style={[styles.popupInput, { color: ink, backgroundColor: line }]}
            />
            {connectNote ? <Text style={connectNote.startsWith("Connected") ? styles.popupBody : styles.popupError}>{connectNote}</Text> : null}
            <View style={styles.popupActions}>
              <Pressable disabled={connecting} onPress={() => setPicked(null)} style={styles.popupButton}>
                <Text style={[styles.popupCancel, { color: ink }]}>Cancel</Text>
              </Pressable>
              <View style={styles.popupActionDivider} />
              <Pressable disabled={connecting} onPress={connectDevice} style={styles.popupButton}>
                {connecting ? <ActivityIndicator color={ink} /> : <Text style={[styles.popupJoin, { color: ink }]}>Connect</Text>}
              </Pressable>
            </View>
          </Chrome>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#000000",
  },
  headerBar: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 64,
  },
  groupedContainer: {
    borderRadius: 28,
    overflow: "visible",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  topContainerHeader: {
    paddingTop: 8,
    paddingBottom: 18,
    paddingHorizontal: 4,
  },
  wifiSquareIcon: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: "#0A84FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  wifiHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  wifiHeaderDesc: {
    color: "#8E8E93",
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.23,
  },
  headerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginHorizontal: 2,
  },
  toggleRow: {
    minHeight: 64,
    paddingHorizontal: 2,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleLabel: {
    color: "#FFFFFF",
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.43,
  },
  sectionHeaderTitle: {
    color: "#8E8E93",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginLeft: 8,
    marginTop: 36,
    marginBottom: 12,
  },
  networkRow: {
    height: 64,
    paddingHorizontal: 2,
    flexDirection: "row",
    alignItems: "center",
  },
  emptyNetwork: {
    alignItems: "center",
    paddingTop: 18,
    paddingBottom: 16,
    paddingHorizontal: 8,
    gap: 16,
  },
  emptyNetworkText: {
    color: "#8E8E93",
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.23,
    textAlign: "center",
  },
  networkTitleWrapper: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    marginRight: 12,
  },
  networkNameText: {
    color: "#FFFFFF",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "400",
    letterSpacing: -0.43,
  },
  networkSubtextText: {
    color: "#8E8E93",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  statusValue: {
    color: "#8E8E93",
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.23,
    marginLeft: 12,
    flexShrink: 1,
    textAlign: "right",
  },
  fieldLabel: {
    color: "#8E8E93",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
    letterSpacing: -0.08,
  },
  fieldInput: {
    color: "#FFFFFF",
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.43,
    paddingVertical: 10,
    paddingHorizontal: 0,
  },
  connectButton: {
    marginTop: 28,
    height: 50,
    borderRadius: 14,
    backgroundColor: "#0A84FF",
    alignItems: "center",
    justifyContent: "center",
  },
  connectButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.43,
  },
  networkRowRight: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconSlot: {
    width: 16,
    height: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  signalWrap: {
    width: 18,
    height: 16,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  signalBar: {
    width: 3,
    borderRadius: 1,
  },
  infoBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#0A84FF",
    alignItems: "center",
    justifyContent: "center",
  },
  infoBadgeText: {
    color: "#0A84FF",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
  },
  networkRowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginTop: 2,
  },
  popupBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  glassPopup: {
    width: 300,
    borderRadius: 34,
    paddingTop: 8,
  },
  popupInput: {
    marginHorizontal: 16,
    marginBottom: BAR_GAP,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: "rgba(120,120,128,0.2)",
    color: "#FFFFFF",
    fontSize: 17,
    letterSpacing: -0.43,
  },
  popupTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
    letterSpacing: -0.43,
    textAlign: "center",
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  popupBody: {
    color: "rgba(235,235,245,0.7)",
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.08,
    textAlign: "center",
    paddingTop: 4,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  popupError: {
    color: "#FF453A",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  popupDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  popupActions: {
    flexDirection: "row",
    minHeight: 48,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.16)",
  },
  popupButton: {
    flex: 1,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  popupActionDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  popupCancel: {
    color: "#0A84FF",
    fontSize: 17,
    letterSpacing: -0.43,
  },
  popupJoin: {
    color: "#0A84FF",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.43,
  },
});

const ChatRow = memo(function ChatRow({
  chat,
  dark,
  revealed,
  selected = false,
  actions,
}: {
  chat: Chat;
  dark: boolean;
  revealed: boolean;
  selected?: boolean;
  actions: MutableRefObject<RowActions>;
}) {
  const ink = dark ? "#FFFFFF" : "#000000";
  const page = dark ? "#000000" : "#FFFFFF";
  const line = dark ? "#3A3A3C" : "#C6C6C8";
  const x = useRef(new Animated.Value(0)).current;
  const pos = useRef(0);
  const [lifted, setLifted] = useState(false);
  const start = useRef(0);
  const opened = useRef(false);

  const settle = (to: number, after?: () => void) => {
    pos.current = to;
    opened.current = to !== 0;
    if (to === 0) setLifted(false);
    Animated.spring(x, { toValue: to, useNativeDriver: true, friction: 8, tension: 140 }).start(({ finished }) => {
      if (finished) after?.();
    });
  };

  useEffect(() => {
    if (!revealed && opened.current) settle(0);
  }, [revealed]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => {
        if (opened.current) return Math.abs(gesture.dx) > 4;
        return (gesture.dx < -6 || Math.abs(gesture.dx) > 8) && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 0.4;
      },
      onMoveShouldSetPanResponderCapture: (_, gesture) => {
        if (opened.current) return Math.abs(gesture.dx) > 6;
        return gesture.dx < -10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 0.45;
      },
      onPanResponderGrant: () => {
        start.current = pos.current;
        setLifted(true);
        hapticSelection();
      },
      onPanResponderMove: (_, gesture) => {
        const next = Math.min(0, start.current + gesture.dx);
        pos.current = next;
        x.setValue(next);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, gesture) => {
        const next = start.current + gesture.dx;
        const width = Dimensions.get("window").width;
        if (next < -width * 0.36 || (gesture.vx < -0.8 && next < -40)) {
          actions.current.remove(chat.id);
          settle(0);
          return;
        }
        if (next < -28 || (gesture.vx < -0.3 && next < -10)) {
          hapticSelection();
          actions.current.reveal(chat.id);
          settle(-DELETE_WIDTH);
          return;
        }
        settle(0);
      },
      onPanResponderTerminate: () => settle(0),
    }),
  ).current;

  return (
    <View style={{ overflow: "hidden", marginVertical: 3, backgroundColor: page }}>
      <View
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: "100%",
          justifyContent: "center",
          alignItems: "flex-end",
          paddingRight: 12,
        }}
      >
        <Pressable
          onPress={() => {
            actions.current.remove(chat.id);
            settle(0);
          }}
          style={{
            width: 72,
            height: "76%",
            backgroundColor: "#FF3B30",
            borderRadius: 16,
            justifyContent: "center",
            alignItems: "center",
            shadowColor: "#FF3B30",
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.35,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <Icon name="trash.fill" size={20} color="#FFFFFF" weight="semibold" />
          <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "600", marginTop: 2, letterSpacing: -0.2 }}>Delete</Text>
        </Pressable>
      </View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>
        <Pressable
          onPress={() => {
            if (opened.current) {
              settle(0);
              return;
            }
            actions.current.open(chat.id);
            hapticSelection();
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingLeft: 16,
            paddingTop: 14,
            paddingBottom: 2,
            borderRadius: lifted ? 22 : 0,
            borderCurve: "continuous",
            overflow: "hidden",
            backgroundColor: page,
            marginHorizontal: lifted ? 8 : 0,
          }}
        >
          {selected ? <Icon name="checkmark.circle.fill" size={22} color="#0A84FF" style={{ marginRight: 10 }} /> : null}
          <View style={{ width: 50, height: 50, minWidth: 50, minHeight: 50, flexShrink: 0, alignItems: "center", justifyContent: "center" }}>
            <Avatar initials={chat.initials} size={50} bg={chat.avatarBg} imageUri={chat.avatarUrl} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingRight: 16 }}>
              <Text numberOfLines={1} style={{ flex: 1, color: ink, fontSize: 17, lineHeight: 22, fontWeight: chat.unread ? "700" : "400", letterSpacing: -0.4 }}>
                {chat.name}
              </Text>
              <Text style={{ color: GRAY, fontSize: 15, lineHeight: 20, fontWeight: chat.unread ? "700" : "400", letterSpacing: -0.23, marginRight: 6 }}>{chat.time}</Text>
              <Icon name="chevron.right" size={13} color={dark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.25)"} weight="semibold" />
            </View>
            <Text numberOfLines={1} style={{ color: chat.unread ? ink : GRAY, fontSize: 15, lineHeight: 20, fontWeight: chat.unread ? "700" : "400", letterSpacing: -0.3, marginTop: 4, paddingRight: 16 }}>
              {chat.preview}
            </Text>
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: dark ? "rgba(255,255,255,0.12)" : "rgba(60,60,67,0.15)", marginTop: 14 }} />
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}, (prev, next) => {
  const a = prev.chat;
  const b = next.chat;
  return (
    prev.dark === next.dark &&
    prev.revealed === next.revealed &&
    prev.selected === next.selected &&
    prev.actions === next.actions &&
    a.id === b.id &&
    a.name === b.name &&
    a.preview === b.preview &&
    a.time === b.time &&
    a.unread === b.unread &&
    a.initials === b.initials &&
    a.folder === b.folder &&
    a.messages.length === b.messages.length
  );
});

function ThreadScreen({
  chat,
  dark,
  saved,
  freezeKeyboard = false,
  onBack,
  onSend,
  onOpenContacts,
  onSaveContact,
}: {
  chat: Chat;
  dark: boolean;
  saved: boolean;
  freezeKeyboard?: boolean;
  onBack: () => void;
  onSend: (text: string) => void;
  onOpenContacts: () => void;
  onSaveContact: () => void;
}) {
  const ink = dark ? "#FFFFFF" : "#000000";
  const page = dark ? "#000000" : "#FFFFFF";
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const [composing, setComposing] = useState(false);
  const draftFieldRef = useRef<TextFieldRef>(null);
  const bottomPad = useRef(new Animated.Value(insets.bottom || 0)).current;
  const keyboardOpen = useRef(false);
  const freezeKeyboardRef = useRef(freezeKeyboard);
  freezeKeyboardRef.current = freezeKeyboard;
  const insetBottom = useRef(insets.bottom);
  const scrollRef = useRef<ScrollView>(null);
  insetBottom.current = insets.bottom || 0;

  useEffect(() => {
    if (!keyboardOpen.current) bottomPad.setValue(Math.max(insetBottom.current, BAR_GAP));
  }, [bottomPad, insets.bottom]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (event) => {
      if (freezeKeyboardRef.current) return;
      keyboardOpen.current = true;
      Animated.timing(bottomPad, {
        toValue: event.endCoordinates.height + BAR_GAP,
        duration: Platform.OS === "ios" ? (event.duration ?? 250) : 220,
        easing: Easing.bezier(0.2, 0.8, 0.25, 1),
        useNativeDriver: false,
      }).start();
    });
    const hideSub = Keyboard.addListener(hideEvent, (event) => {
      if (freezeKeyboardRef.current) return;
      keyboardOpen.current = false;
      Animated.timing(bottomPad, {
        toValue: Math.max(insetBottom.current, BAR_GAP),
        duration: Platform.OS === "ios" ? (event.duration ?? 250) : 220,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: false,
      }).start();
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [bottomPad]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: "transparent" }}>
      <StatusBar style={dark ? "light" : "dark"} />

      {/* iOS Chat Header Navigation Bar with Glass UI & Large Profile */}
      <View style={{ paddingTop: 4, paddingBottom: 10, paddingHorizontal: 16, backgroundColor: "transparent" }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <GlassPress onPress={onBack}>
            <Chrome className="h-[46px] w-[46px] items-center justify-center rounded-full">
              <Icon name="chevron.left" size={18} color={ink} weight="semibold" />
            </Chrome>
          </GlassPress>

          <View style={{ alignItems: "center", justifyContent: "center" }}>
            <Avatar initials={chat.initials} size={68} bg={chat.avatarBg} imageUri={chat.avatarUrl} />
            <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: ink, fontSize: 13, fontWeight: "600", letterSpacing: -0.2 }}>
                {chat.shortName}
              </Text>
              <Icon name="chevron.right" size={10} color={GRAY} weight="semibold" style={{ marginLeft: 3 }} />
            </View>
          </View>

          {saved ? (
            <View style={{ width: 46 }} />
          ) : (
            <Pressable onPress={onSaveContact} hitSlop={8} style={{ maxWidth: 92, paddingTop: 12 }}>
              <Text style={{ color: ink, fontSize: 15, fontWeight: "600", textAlign: "right" }}>Save Contact</Text>
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 0 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {/* iOS Centered Timestamp Header */}
        <View style={{ alignItems: "center", marginVertical: 12 }}>
          <Text style={{ color: GRAY, fontSize: 12, fontWeight: "500", letterSpacing: -0.1 }}>
            {chat.dayLabel}
          </Text>
        </View>

        {chat.messages.map((message) => (
          <IMessageBubble
            key={message.id}
            text={message.text}
            outgoing={message.outgoing}
            dark={dark}
            pageBg={page}
          />
        ))}
      </ScrollView>

      <Animated.View style={{ paddingBottom: bottomPad, paddingTop: BAR_GAP }}>
        {Platform.OS === "ios" ? (
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 10 }}>
            <Host colorScheme={dark ? "dark" : "light"} style={{ flex: 1, height: 46 }}>
              <GlassEffectContainer spacing={16}>
                <HStack
                  spacing={8}
                  alignment="center"
                  modifiers={[
                    padding({ horizontal: 14 }),
                    frame({ height: 46, maxWidth: 10000 }),
                    glassEffect({ glass: { variant: "regular", interactive: true }, shape: "capsule" }),
                  ]}
                >
                  <TextField
                    ref={draftFieldRef}
                    placeholder="Text Message"
                    onTextChange={setDraft}
                    onFocusChange={setComposing}
                    modifiers={[textFieldStyle("plain"), frame({ maxWidth: 10000 })]}
                  />
                  {draft.trim().length > 0 ? (
                    <Button label="Send" onPress={send} modifiers={[buttonStyle("plain")]} />
                  ) : null}
                </HStack>
              </GlassEffectContainer>
            </Host>
            <Host matchContents colorScheme={dark ? "dark" : "light"} style={{ width: 46, height: 46 }}>
              <Button
                label={composing ? "Close" : "Contacts"}
                systemImage={composing ? "xmark" : "square.and.pencil"}
                onPress={() => {
                  if (composing) {
                    draftFieldRef.current?.blur();
                    Keyboard.dismiss();
                    setComposing(false);
                  } else {
                    onOpenContacts();
                  }
                }}
                modifiers={[
                  buttonStyle("glass"),
                  buttonBorderShape("circle"),
                  labelStyle("iconOnly"),
                  controlSize("large"),
                  frame({ width: 46, height: 46 }),
                ]}
              />
            </Host>
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16 }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Text Message"
              placeholderTextColor={GRAY}
              keyboardAppearance={dark ? "dark" : "light"}
              returnKeyType="send"
              onSubmitEditing={send}
              style={{ flex: 1, height: 46, color: ink, fontSize: 16 }}
            />
          </View>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

function FilterMenu({
  dark,
  filter,
  onFilter,
  onSelectAll,
}: {
  dark: boolean;
  filter: InboxFilter;
  onFilter: (next: InboxFilter) => void;
  onSelectAll: () => void;
}) {
  const ink = dark ? "#FFFFFF" : "#000000";

  if (Platform.OS === "ios") {
    return (
      <Host matchContents colorScheme={dark ? "dark" : "light"} style={{ width: 52, height: 52 }}>
        <Menu
          label="Filter"
          systemImage="line.3.horizontal"
          modifiers={[
            buttonStyle("glass"),
            buttonBorderShape("circle"),
            labelStyle("iconOnly"),
            menuIndicator("hidden"),
            controlSize("extraLarge"),
            frame({ width: 52, height: 52 }),
          ]}
        >
          <Picker
            selection={filter}
            onSelectionChange={(value) => {
              if (value === "messages" || value === "spam" || value === "deleted") onFilter(value);
            }}
            modifiers={[pickerStyle("inline"), labelsHidden()]}
          >
            <Label title="Messages" systemImage="bubble.left.and.bubble.right" modifiers={[tag("messages")]} />
            <Label title="Spam" systemImage="xmark.bin" modifiers={[tag("spam")]} />
            <Label title="Recently Deleted" systemImage="trash" modifiers={[tag("deleted")]} />
          </Picker>
          <Button label="Select All" systemImage="checkmark.circle" onPress={onSelectAll} />
          <Divider />
          <Button label="Manage Filtering" modifiers={[padding({ top: 8 })]} />
        </Menu>
      </Host>
    );
  }

  return (
    <Pressable
      onPress={() => {
        const next: InboxFilter = filter === "messages" ? "spam" : filter === "spam" ? "deleted" : "messages";
        onFilter(next);
      }}
      hitSlop={8}
    >
      <Chrome className="h-[52px] w-[52px] items-center justify-center rounded-full">
        <Icon name="line.3.horizontal" size={22} color={ink} weight="medium" />
      </Chrome>
    </Pressable>
  );
}

type SettingsPane = "connection" | "wifi" | "device" | "router" | "information" | "users";

function formatRate(bps: number) {
  const speed = Math.max(0, bps);
  if (speed < 1024) return `${Math.round(speed)} B/s`;
  if (speed < 1024 * 1024) return `${(speed / 1024).toFixed(1)} KB/s`;
  return `${(speed / (1024 * 1024)).toFixed(2)} MB/s`;
}

const SECURITY_MODES = [
  { id: "OPEN", title: "OPEN" },
  { id: "WPA2PSK", title: "WPA2-PSK" },
  { id: "WPAPSK", title: "WPA-PSK" },
  { id: "WPAPSKWPA2PSK", title: "WPA/WPA2-PSK" },
];
const NETWORK_MODES = [
  { id: "6", title: "802.11 b/g/n" },
  { id: "5", title: "802.11 g/n" },
  { id: "4", title: "802.11 b/g" },
  { id: "3", title: "802.11 n" },
  { id: "2", title: "802.11 g" },
  { id: "1", title: "802.11 b" },
];
const BANDWIDTHS = [
  { id: "0", title: "20MHz" },
  { id: "1", title: "20MHz/40MHz" },
];
const STATION_OPTIONS = ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1"].map((id) => ({ id, title: id }));
const CHANNEL_OPTIONS = [{ id: "auto", title: "Auto" }, ...Array.from({ length: 13 }, (_, index) => ({ id: String(index + 1), title: String(index + 1) }))];
const SLEEP_OPTIONS = [
  { id: "0", title: "Off" },
  { id: "10", title: "10 min" },
  { id: "30", title: "30 min" },
  { id: "60", title: "60 min" },
];

function withCurrent(options: { id: string; title: string }[], value: string) {
  if (!value || options.some((item) => item.id === value)) return options;
  return [{ id: value, title: value }, ...options];
}

function SaveTick({ dark, saving, onPress }: { dark: boolean; saving: boolean; onPress: () => void }) {
  return (
    <Host matchContents colorScheme={dark ? "dark" : "light"} style={{ width: 36, height: 36 }}>
      <Button
        label={saving ? "Saving" : "Save"}
        systemImage="checkmark"
        onPress={onPress}
        modifiers={[
          buttonStyle("glass"),
          buttonBorderShape("circle"),
          labelStyle("iconOnly"),
          controlSize("regular"),
          frame({ width: 36, height: 36 }),
        ]}
      />
    </Host>
  );
}

function SettingBlock({
  title,
  dirty,
  saving,
  onSave,
  children,
}: {
  title: string;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  children: ReactNode;
}) {
  const dark = useColorScheme() === "dark";
  const ink = dark ? "#FFFFFF" : "#000000";
  return (
    <View style={{ marginTop: 22 }}>
      <Chrome
        effect="regular"
        colorScheme={dark ? "dark" : "light"}
        style={[
          styles.groupedContainer,
          {
            backgroundColor: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            borderWidth: 0,
          },
        ]}
      >
        <View style={{ minHeight: 44, justifyContent: "center", paddingRight: dirty ? 46 : 0 }}>
          <Text style={{ color: ink, fontSize: 20, fontWeight: "700", letterSpacing: -0.4 }}>{title}</Text>
        </View>
        {children}
      </Chrome>
      {dirty ? (
        <View style={{ position: "absolute", right: 16, top: 16 }}>
          <SaveTick dark={dark} saving={saving} onPress={onSave} />
        </View>
      ) : null}
    </View>
  );
}

function ChoiceRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; title: string }[];
  onChange: (value: string) => void;
}) {
  const dark = useColorScheme() === "dark";
  const ink = dark ? "#FFFFFF" : "#000000";
  return (
    <View style={styles.networkRow}>
      <Text style={[styles.networkNameText, { color: ink, flex: 1 }]} numberOfLines={1}>
        {label}
      </Text>
      <Host matchContents colorScheme={dark ? "dark" : "light"} style={{ height: 36 }}>
        <Picker
          selection={value}
          onSelectionChange={(next) => {
            if (typeof next === "string") onChange(next);
          }}
          modifiers={[pickerStyle("menu")]}
        >
          {options.map((item) => (
            <Label key={item.id} title={item.title} modifiers={[tag(item.id)]} />
          ))}
        </Picker>
      </Host>
    </View>
  );
}

function extractOtp(text: string) {
  const labeled = text.match(/(?:otp|code|pin|password|verification|verify|one[-\s]?time)[^\d]{0,16}(\d{4,8})/i);
  if (labeled?.[1]) return labeled[1];
  if (text.trim().length > 80) return null;
  const bare = text.match(/(?:^|\s)(\d{4,8})(?:\s|$)/);
  return bare?.[1] ?? null;
}

function formatData(raw: string) {
  const bytes = Number(raw);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function SettingsPage({
  ip,
  pane,
  signalLevel,
  onOpen,
}: {
  ip: string;
  pane: SettingsPane | null;
  signalLevel: number;
  onOpen: (pane: SettingsPane) => void;
}) {
  const dark = useColorScheme() === "dark";
  const insets = useSafeAreaInsets();
  const page = dark ? "#000000" : "#FFFFFF";
  const ink = dark ? "#FFFFFF" : "#000000";
  const line = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  const cardFill = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const cardLine = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const [setup, setSetup] = useState<WifiSetup | null>(null);
  const [controls, setControls] = useState<DeviceControls | null>(null);
  const [draftSsid, setDraftSsid] = useState("");
  const [draftMax, setDraftMax] = useState("10");
  const [wifiOn, setWifiOn] = useState(true);
  const [dualOn, setDualOn] = useState(false);
  const [showName, setShowName] = useState(true);
  const [authMode, setAuthMode] = useState("WPA2PSK");
  const [password, setPassword] = useState("");
  const [networkMode, setNetworkMode] = useState("6");
  const [bandwidth, setBandwidth] = useState("1");
  const [country, setCountry] = useState("PK");
  const [channel, setChannel] = useState("auto");
  const [wpsPin, setWpsPin] = useState("");
  const [blacklistOn, setBlacklistOn] = useState(false);
  const [pinOn, setPinOn] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [sleepMode, setSleepMode] = useState("0");
  const [fastBoot, setFastBoot] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [note, setNote] = useState("");
  const [users, setUsers] = useState<WifiUser[]>([]);
  const [userNote, setUserNote] = useState("");
  const [deviceAsk, setDeviceAsk] = useState<null | "reset" | "off" | "restart">(null);
  const hold = useRef({ basic: false, advanced: false, black: false, pin: false, power: false });
  const paneX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const settingsStamp = useRef("");
  const setupStamp = useRef("");
  const controlsStamp = useRef("");
  const usersStamp = useRef("");

  const applySetup = (next: WifiSetup, force = false) => {
    setSetup(next);
    if (force || !hold.current.basic) {
      setDraftSsid(next.ssid);
      setDraftMax(next.maxAccess || "10");
      setWifiOn(next.wifiEnabled);
      setDualOn(next.dualEnabled);
      setShowName(next.showName);
      setAuthMode(next.authMode || "WPA2PSK");
    }
    if (force || !hold.current.advanced) {
      setNetworkMode(next.networkMode || "6");
      setBandwidth(next.bandwidth || "1");
      setCountry(next.country || "PK");
      setChannel(next.channel || "auto");
    }
    if (force || !hold.current.black) setBlacklistOn(next.blacklist);
  };

  const applyControls = (next: DeviceControls, force = false) => {
    setControls(next);
    if (force || !hold.current.pin) setPinOn(next.pinEnabled);
    if (force || !hold.current.power) {
      setSleepMode(next.sleep || "0");
      setFastBoot(next.fastBoot);
    }
  };

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [next, wifi, device] = await Promise.all([fetchDeviceSettings(ip), fetchWifiSetup(ip), fetchDeviceControls(ip)]);
      if (!alive) return;
      if (next) {
        const stamp = JSON.stringify(next);
        if (settingsStamp.current !== stamp) {
          settingsStamp.current = stamp;
          setSettings(next);
        }
      }
      if (wifi) {
        const stamp = JSON.stringify(wifi);
        if (setupStamp.current !== stamp) {
          setupStamp.current = stamp;
          applySetup(wifi);
        }
      }
      if (device) {
        const stamp = JSON.stringify(device);
        if (controlsStamp.current !== stamp) {
          controlsStamp.current = stamp;
          applyControls(device);
        }
      }
    };
    load();
    const timer = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [ip]);

  useEffect(() => {
    let alive = true;
    const loadUsers = async () => {
      const next = await fetchWifiUsers(ip);
      if (!alive || !next) return;
      const stamp = JSON.stringify(next);
      if (usersStamp.current === stamp) return;
      usersStamp.current = stamp;
      setUsers(next);
    };
    loadUsers();
    const timer = setInterval(loadUsers, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [ip]);

  useEffect(() => {
    Animated.timing(paneX, {
      toValue: pane ? 0 : SCREEN_WIDTH,
      duration: 140,
      easing: Easing.bezier(0.2, 0.9, 0.3, 1),
      useNativeDriver: true,
    }).start();
  }, [pane, paneX]);

  const cardStyle = [
    styles.groupedContainer,
    {
      backgroundColor: cardFill,
      borderWidth: 0,
    },
  ];

  const batteryText = settings?.battery
    ? `${settings.battery}%${settings.charging ? " · Charging" : ""}`
    : "Waiting for the device";
  const dataText = settings ? formatData(settings.monthlyBytes) : "—";
  const bars = settings ? Number(settings.signalbar) || 0 : signalLevel;

  const failNote = "The device did not save this. Open Connections and sign in with the admin password.";

  const saveBasic = async () => {
    hapticSelection();
    if (!setup || savingKey) return;
    const name = draftSsid.trim();
    if (!name) {
      setNote("Enter a network name.");
      return;
    }
    if (password && password.length < 8) {
      setNote("Password needs at least 8 characters.");
      return;
    }
    setSavingKey("basic");
    setNote("");
    const wifiOk = wifiOn === setup.wifiEnabled ? true : await setWifiEnabled(ip, wifiOn);
    const dualOk = dualOn === setup.dualEnabled ? true : await saveDualAccess(ip, dualOn);
    const saved = await saveWifiSettings(ip, {
      ssid: name,
      maxAccess: draftMax || "10",
      authMode,
      broadcast: showName ? "1" : "0",
      cipher: setup.cipher,
      noForwarding: setup.noForwarding,
      passphrase: password,
    });
    setSavingKey("");
    if (!wifiOk || !dualOk || !saved) {
      setNote(failNote);
      return;
    }
    hold.current.basic = false;
    setPassword("");
    setNote("Saved on the device.");
    const next = await fetchWifiSetup(ip);
    if (next) applySetup(next, true);
  };

  const saveAdvanced = async () => {
    hapticSelection();
    if (!setup || savingKey) return;
    setSavingKey("advanced");
    setNote("");
    const radioOk = await saveRadioSettings(ip, {
      networkMode,
      country,
      channel,
      bandwidth,
      maxAccess: draftMax || setup.maxAccess,
    });
    const pin = wpsPin.trim();
    const wpsOk = pin ? await startWps(ip, setup.wpsSsid || draftSsid, setup.wpsIndex, "PIN", pin) : true;
    setSavingKey("");
    if (!radioOk || !wpsOk) {
      setNote(failNote);
      return;
    }
    hold.current.advanced = false;
    setWpsPin("");
    setNote("Saved on the device.");
    const next = await fetchWifiSetup(ip);
    if (next) applySetup(next, true);
  };

  const saveBlacklist = async () => {
    hapticSelection();
    if (savingKey) return;
    setSavingKey("black");
    setNote("");
    const ok = await setBlacklistEnabled(ip, blacklistOn);
    setSavingKey("");
    if (!ok) {
      setNote(failNote);
      return;
    }
    hold.current.black = false;
    setNote("Saved on the device.");
    const next = await fetchWifiSetup(ip);
    if (next) applySetup(next, true);
  };

  const savePin = async () => {
    hapticSelection();
    if (savingKey) return;
    if (currentPin.trim().length < 4) {
      setNote("Enter the current PIN.");
      return;
    }
    setSavingKey("pin");
    setNote("");
    const ok = await setSimPin(ip, pinOn, currentPin.trim());
    setSavingKey("");
    if (!ok) {
      setNote(failNote);
      return;
    }
    hold.current.pin = false;
    setCurrentPin("");
    setNote("Saved on the device.");
    const next = await fetchDeviceControls(ip);
    if (next) applyControls(next, true);
  };

  const savePower = async () => {
    hapticSelection();
    if (savingKey) return;
    setSavingKey("power");
    setNote("");
    const ok = await savePowerSettings(ip, sleepMode, fastBoot);
    setSavingKey("");
    if (!ok) {
      setNote(failNote);
      return;
    }
    hold.current.power = false;
    setNote("Saved on the device.");
    const next = await fetchDeviceControls(ip);
    if (next) applyControls(next, true);
  };

  const runPbc = async () => {
    if (!setup) return;
    setNote("");
    const ok = await startWps(ip, setup.wpsSsid || draftSsid, setup.wpsIndex, "PBC");
    setNote(ok ? "WPS started." : failNote);
  };

  const runDeviceAsk = async () => {
    const action = deviceAsk;
    setDeviceAsk(null);
    if (!action) return;
    const ok =
      action === "reset" ? await resetFactorySettings(ip) : action === "off" ? await shutdownDevice(ip) : await rebootDevice(ip);
    setNote(ok ? "Sent to the device." : failNote);
  };

  const toggleUser = async (user: WifiUser) => {
    if (user.self) return;
    const nextBlocked = !user.blocked;
    setUsers((list) => list.map((item) => (item.mac === user.mac ? { ...item, blocked: nextBlocked } : item)));
    setUserNote("");
    const ok = await setWifiUserBlocked(ip, user.mac, user.name, nextBlocked);
    const fresh = await fetchWifiUsers(ip);
    if (fresh) setUsers(fresh);
    if (!ok) {
      setUserNote("The device did not update this user. Open Connections and sign in with the admin password.");
    }
  };

  const basicDirty = setup
    ? draftSsid !== setup.ssid ||
      draftMax !== (setup.maxAccess || "10") ||
      wifiOn !== setup.wifiEnabled ||
      dualOn !== setup.dualEnabled ||
      showName !== setup.showName ||
      authMode !== (setup.authMode || "WPA2PSK") ||
      password.length > 0
    : false;
  const advancedDirty = setup
    ? networkMode !== (setup.networkMode || "6") ||
      bandwidth !== (setup.bandwidth || "1") ||
      country !== (setup.country || "PK") ||
      channel !== (setup.channel || "auto") ||
      wpsPin.length > 0
    : false;
  const blackDirty = setup ? blacklistOn !== setup.blacklist : false;
  const pinDirty = controls ? pinOn !== controls.pinEnabled || currentPin.length > 0 : currentPin.length > 0;
  const powerDirty = controls ? sleepMode !== (controls.sleep || "0") || fastBoot !== controls.fastBoot : false;
  const editBasic = () => {
    hold.current.basic = true;
  };
  const editAdvanced = () => {
    hold.current.advanced = true;
  };

  const rows: { id: SettingsPane; title: string; icon: SFSymbol; value: string }[] = [
    {
      id: "connection",
      title: "Connection",
      icon: "antenna.radiowaves.left.and.right",
      value: settings ? [settings.networkType, settings.provider].filter(Boolean).join(" · ") || "Live" : "—",
    },
    {
      id: "wifi",
      title: "Wi-Fi",
      icon: "wifi",
      value: settings?.ssid || "—",
    },
    {
      id: "device",
      title: "Device",
      icon: "iphone",
      value: settings?.battery ? `${settings.battery}%` : "—",
    },
    {
      id: "router",
      title: "Router",
      icon: "server.rack",
      value: settings?.domain || "—",
    },
    {
      id: "information",
      title: "Information",
      icon: "info.circle",
      value: settings?.hardware || "—",
    },
    {
      id: "users",
      title: "Users",
      icon: "person.2",
      value: users.length > 0 ? `${users.length}` : "—",
    },
  ];

  return (
    <View style={[styles.screenContainer, { backgroundColor: page }]}>
      <StatusBar style={dark ? "light" : "dark"} />
      <SafeAreaView edges={["top"]} style={[styles.safeArea, { backgroundColor: "transparent" }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, { paddingTop: 64 }]} keyboardShouldPersistTaps="handled">
          <Chrome effect="regular" colorScheme={dark ? "dark" : "light"} style={cardStyle}>
            <View style={styles.topContainerHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={[styles.wifiSquareIcon, { backgroundColor: ink, marginBottom: 0 }]}>
                  <Icon name="gearshape.fill" size={28} color={page} weight="semibold" />
                </View>
                <IosSignal level={bars} />
              </View>
              <Text style={[styles.wifiHeaderTitle, { color: ink, marginTop: 14 }]}>Settings</Text>
              <Text style={styles.wifiHeaderDesc}>
                {batteryText}
                {"\n"}
                Data {dataText}
              </Text>
            </View>
          </Chrome>

          <Text style={styles.sectionHeaderTitle}>Settings</Text>
          <Chrome effect="regular" colorScheme={dark ? "dark" : "light"} style={[cardStyle, { marginBottom: 40 }]}>
            {rows.map((row, index) => (
              <View key={row.id}>
                <Pressable
                  onPress={() => {
                    onOpen(row.id);
                    hapticSelection();
                  }}
                  style={styles.networkRow}
                >
                  <View style={[styles.wifiSquareIcon, { width: 32, height: 32, borderRadius: 8, marginBottom: 0, backgroundColor: ink }]}>
                    <Icon name={row.icon} size={16} color={page} weight="semibold" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.networkNameText, { color: ink }]} numberOfLines={1}>
                      {row.title}
                    </Text>
                    <Text style={styles.networkSubtextText} numberOfLines={1}>
                      {row.value}
                    </Text>
                  </View>
                  <Icon name="chevron.right" size={14} color={GRAY} weight="semibold" />
                </Pressable>
                {index < rows.length - 1 ? <View style={[styles.networkRowDivider, { backgroundColor: line }]} /> : null}
              </View>
            ))}
          </Chrome>
        </ScrollView>

        <Animated.View
          pointerEvents={pane ? "auto" : "none"}
          style={[StyleSheet.absoluteFill, { backgroundColor: page, paddingTop: insets.top, transform: [{ translateX: paneX }] }]}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.scrollContent, { paddingTop: 8 }]}
            keyboardShouldPersistTaps="handled"
          >
            {pane === "connection" ? (
              <>
                <Text style={[styles.wifiHeaderTitle, { color: ink, marginBottom: 16, marginLeft: 58, marginTop: 4 }]}>Connection</Text>
                <Chrome effect="regular" colorScheme={dark ? "dark" : "light"} style={cardStyle}>
                  <StatusLine label="Network" value={settings?.networkType || "—"} />
                  <StatusLine label="Provider" value={settings?.provider || "—"} />
                  <StatusLine label="Signal" value={settings ? `${settings.signalbar} bars` : "—"} />
                  <StatusLine label="RSSI" value={settings?.rssi ? `${settings.rssi} dBm` : "—"} />
                  <StatusLine label="Status" value={settings?.connected ? "Connected" : "Waiting"} />
                  <StatusLine label="WAN IP" value={settings?.wanIp || "—"} />
                  <StatusLine label="Mode" value={settings?.netSelect || "—"} last />
                </Chrome>
              </>
            ) : null}
            {pane === "wifi" ? (
              <>
                <Text style={[styles.wifiHeaderTitle, { color: ink, marginBottom: 8, marginLeft: 58, marginTop: 4 }]}>Wi-Fi</Text>
                <SettingBlock title="Basic Settings" dirty={basicDirty} saving={savingKey === "basic"} onSave={saveBasic}>
                  <View style={styles.networkRow}>
                    <Text style={[styles.networkNameText, { color: ink, flex: 1 }]}>Wi-Fi</Text>
                    <Switch value={wifiOn} onValueChange={(value) => { editBasic(); setWifiOn(value); }} trackColor={{ false: "#787880", true: "#0A84FF" }} />
                  </View>
                  <View style={[styles.networkRowDivider, { backgroundColor: line }]} />
                  <View style={styles.networkRow}>
                    <Text style={[styles.networkNameText, { color: ink, flex: 1 }]}>Dual Access Point</Text>
                    <Switch value={dualOn} onValueChange={(value) => { editBasic(); setDualOn(value); }} trackColor={{ false: "#787880", true: "#0A84FF" }} />
                  </View>
                  <View style={[styles.networkRowDivider, { backgroundColor: line }]} />
                  <View style={styles.networkRow}>
                    <Text style={[styles.networkNameText, { color: ink }]}>Network Name (SSID) *</Text>
                    <TextInput value={draftSsid} onChangeText={(value) => { editBasic(); setDraftSsid(value); }} autoCorrect={false} autoCapitalize="none" placeholder="Name" placeholderTextColor={GRAY} style={{ flex: 1, marginLeft: 12, color: ink, fontSize: 17, textAlign: "right" }} />
                  </View>
                  <View style={[styles.networkRowDivider, { backgroundColor: line }]} />
                  <View style={styles.networkRow}>
                    <Text style={[styles.networkNameText, { color: ink, flex: 1 }]}>Show Network Name</Text>
                    <Switch value={showName} onValueChange={(value) => { editBasic(); setShowName(value); }} trackColor={{ false: "#787880", true: "#0A84FF" }} />
                  </View>
                  <View style={[styles.networkRowDivider, { backgroundColor: line }]} />
                  <ChoiceRow label="Security Mode" value={authMode} options={withCurrent(SECURITY_MODES, authMode)} onChange={(value) => { editBasic(); setAuthMode(value); }} />
                  <View style={[styles.networkRowDivider, { backgroundColor: line }]} />
                  <View style={styles.networkRow}>
                    <Text style={[styles.networkNameText, { color: ink }]}>Password</Text>
                    <TextInput value={password} onChangeText={(value) => { editBasic(); setPassword(value); }} secureTextEntry autoCorrect={false} autoCapitalize="none" placeholder="New password" placeholderTextColor={GRAY} style={{ flex: 1, marginLeft: 12, color: ink, fontSize: 17, textAlign: "right" }} />
                  </View>
                  <View style={[styles.networkRowDivider, { backgroundColor: line }]} />
                  <ChoiceRow label="Max Station Number" value={draftMax} options={STATION_OPTIONS} onChange={(value) => { editBasic(); setDraftMax(value); }} />
                </SettingBlock>

                <SettingBlock title="Advanced Settings" dirty={advancedDirty} saving={savingKey === "advanced"} onSave={saveAdvanced}>
                  <StatusLine label="Band Selection" value={setup?.band || "2.4 GHz"} />
                  <ChoiceRow label="Network Mode" value={networkMode} options={withCurrent(NETWORK_MODES, networkMode)} onChange={(value) => { editAdvanced(); setNetworkMode(value); }} />
                  <View style={[styles.networkRowDivider, { backgroundColor: line }]} />
                  <ChoiceRow label="Channel Bandwidth" value={bandwidth} options={withCurrent(BANDWIDTHS, bandwidth)} onChange={(value) => { editAdvanced(); setBandwidth(value); }} />
                  <View style={[styles.networkRowDivider, { backgroundColor: line }]} />
                  <ChoiceRow label="Country/Region Code" value={country} options={withCurrent([{ id: "PK", title: "PAKISTAN" }], country)} onChange={(value) => { editAdvanced(); setCountry(value); }} />
                  <View style={[styles.networkRowDivider, { backgroundColor: line }]} />
                  <ChoiceRow label="Frequency (Channel)" value={channel} options={withCurrent(CHANNEL_OPTIONS, channel)} onChange={(value) => { editAdvanced(); setChannel(value); }} />
                  <View style={[styles.networkRowDivider, { backgroundColor: line }]} />
                  <StatusLine label="SSID" value={setup?.wpsSsid || draftSsid || "—"} />
                  <View style={styles.networkRow}>
                    <Text style={[styles.networkNameText, { color: ink }]}>WPS PIN</Text>
                    <TextInput value={wpsPin} onChangeText={(value) => { editAdvanced(); setWpsPin(value); }} keyboardType="number-pad" placeholder="PIN" placeholderTextColor={GRAY} style={{ flex: 1, marginLeft: 12, color: ink, fontSize: 17, textAlign: "right" }} />
                  </View>
                  <View style={[styles.networkRowDivider, { backgroundColor: line }]} />
                  <Pressable onPress={runPbc} style={styles.networkRow}>
                    <Text style={[styles.networkNameText, { color: ink, flex: 1 }]}>PBC</Text>
                    <Text style={{ color: "#0A84FF", fontSize: 17, fontWeight: "600" }}>Start</Text>
                  </Pressable>
                </SettingBlock>

                <SettingBlock title="Black List" dirty={blackDirty} saving={savingKey === "black"} onSave={saveBlacklist}>
                  <View style={styles.networkRow}>
                    <Text style={[styles.networkNameText, { color: ink, flex: 1 }]}>Black List Switch</Text>
                    <Switch value={blacklistOn} onValueChange={(value) => { hold.current.black = true; setBlacklistOn(value); }} trackColor={{ false: "#787880", true: "#0A84FF" }} />
                  </View>
                  {blacklistOn
                    ? users.map((user) => (
                        <View key={user.mac}>
                          <View style={[styles.networkRowDivider, { backgroundColor: line }]} />
                          <View style={styles.networkRow}>
                            <View style={{ flex: 1, marginRight: 12 }}>
                              <Text style={[styles.networkNameText, { color: ink }]} numberOfLines={1}>{user.self ? `${user.name} · This phone` : user.name}</Text>
                              <Text style={styles.networkSubtextText} numberOfLines={1}>{user.blocked ? "Blocked" : user.ip || "Connected"}</Text>
                            </View>
                            {user.self ? null : (
                              <Pressable onPress={() => toggleUser(user)}>
                                <Text style={{ color: user.blocked ? "#0A84FF" : "#FF3B30", fontSize: 17, fontWeight: "600" }}>{user.blocked ? "Unblock" : "Block"}</Text>
                              </Pressable>
                            )}
                          </View>
                        </View>
                      ))
                    : null}
                </SettingBlock>
                {note ? <Text style={[styles.wifiHeaderDesc, { marginTop: 12 }]}>{note}</Text> : null}
              </>
            ) : null}
            {pane === "device" ? (
              <>
                <Text style={[styles.wifiHeaderTitle, { color: ink, marginBottom: 8, marginLeft: 58, marginTop: 4 }]}>Device</Text>
                <Chrome effect="regular" colorScheme={dark ? "dark" : "light"} style={cardStyle}>
                  <StatusLine label="Battery" value={settings?.battery ? `${settings.battery}%` : "—"} />
                  <StatusLine label="Charging" value={settings?.charging ? "Charging" : "Not charging"} />
                  <StatusLine label="Signal" value={settings ? `${settings.signalbar} bars` : "—"} />
                  <StatusLine label="RSSI" value={settings?.rssi ? `${settings.rssi} dBm` : "—"} last />
                </Chrome>
                <SettingBlock title="PIN Management" dirty={pinDirty} saving={savingKey === "pin"} onSave={savePin}>
                  <View style={styles.networkRow}>
                    <Text style={[styles.networkNameText, { color: ink, flex: 1 }]}>PIN Status</Text>
                    <Switch value={pinOn} onValueChange={(value) => { hold.current.pin = true; setPinOn(value); }} trackColor={{ false: "#787880", true: "#0A84FF" }} />
                  </View>
                  <View style={[styles.networkRowDivider, { backgroundColor: line }]} />
                  <View style={styles.networkRow}>
                    <Text style={[styles.networkNameText, { color: ink }]}>Current PIN *</Text>
                    <TextInput value={currentPin} onChangeText={(value) => { hold.current.pin = true; setCurrentPin(value); }} secureTextEntry keyboardType="number-pad" placeholder="PIN" placeholderTextColor={GRAY} style={{ flex: 1, marginLeft: 12, color: ink, fontSize: 17, textAlign: "right" }} />
                  </View>
                </SettingBlock>
                <SettingBlock title="Power" dirty={powerDirty} saving={savingKey === "power"} onSave={savePower}>
                  <ChoiceRow label="Power Save" value={sleepMode} options={withCurrent(SLEEP_OPTIONS, sleepMode)} onChange={(value) => { hold.current.power = true; setSleepMode(value); }} />
                  <View style={[styles.networkRowDivider, { backgroundColor: line }]} />
                  <View style={styles.networkRow}>
                    <Text style={[styles.networkNameText, { color: ink, flex: 1 }]}>Fast Boot</Text>
                    <Switch value={fastBoot} onValueChange={(value) => { hold.current.power = true; setFastBoot(value); }} trackColor={{ false: "#787880", true: "#0A84FF" }} />
                  </View>
                </SettingBlock>
                <SettingBlock title="Device" dirty={false} saving={false} onSave={() => undefined}>
                  <Pressable onPress={() => setDeviceAsk("reset")} style={styles.networkRow}>
                    <Text style={[styles.networkNameText, { color: "#FF3B30", flex: 1 }]}>Reset Factory Settings</Text>
                  </Pressable>
                  <View style={[styles.networkRowDivider, { backgroundColor: line }]} />
                  <Pressable onPress={() => setDeviceAsk("off")} style={styles.networkRow}>
                    <Text style={[styles.networkNameText, { color: ink, flex: 1 }]}>Shutdown</Text>
                  </Pressable>
                  <View style={[styles.networkRowDivider, { backgroundColor: line }]} />
                  <Pressable onPress={() => setDeviceAsk("restart")} style={styles.networkRow}>
                    <Text style={[styles.networkNameText, { color: ink, flex: 1 }]}>Restart</Text>
                  </Pressable>
                </SettingBlock>
                {note ? <Text style={[styles.wifiHeaderDesc, { marginTop: 12 }]}>{note}</Text> : null}
              </>
            ) : null}
            {pane === "router" ? (
              <>
                <Text style={[styles.wifiHeaderTitle, { color: ink, marginBottom: 16, marginLeft: 58, marginTop: 4 }]}>Router</Text>
                <Chrome effect="regular" colorScheme={dark ? "dark" : "light"} style={cardStyle}>
                  <StatusLine label="Address" value={ip} />
                  <StatusLine label="Domain" value={settings?.domain || "—"} />
                  <StatusLine label="Data used" value={settings ? formatData(settings.monthlyBytes) : "—"} />
                  <StatusLine label="Data limit" value={settings?.dataLimit ? "On" : "Off"} last />
                </Chrome>
              </>
            ) : null}
            {pane === "information" ? (
              <>
                <Text style={[styles.wifiHeaderTitle, { color: ink, marginBottom: 16, marginLeft: 58, marginTop: 4 }]}>Information</Text>
                <Chrome effect="regular" colorScheme={dark ? "dark" : "light"} style={cardStyle}>
                  <StatusLine label="Firmware" value={settings?.firmware || "—"} />
                  <StatusLine label="Hardware" value={settings?.hardware || "—"} />
                  <StatusLine label="IMEI" value={settings?.imei || "—"} />
                  <StatusLine label="IMSI" value={settings?.imsi || "—"} last />
                </Chrome>
              </>
            ) : null}
            {pane === "users" ? (
              <>
                <Text style={[styles.wifiHeaderTitle, { color: ink, marginBottom: 16, marginLeft: 58, marginTop: 4 }]}>Users</Text>
                <Chrome effect="regular" colorScheme={dark ? "dark" : "light"} style={cardStyle}>
                  {users.length === 0 ? (
                    <View style={styles.networkRow}>
                      <Text style={[styles.networkNameText, { color: ink }]}>No Wi-Fi users yet</Text>
                    </View>
                  ) : (
                    users.map((user, index) => (
                      <View key={user.mac}>
                        <View style={styles.networkRow}>
                          <View style={{ flex: 1, marginRight: 12 }}>
                            <Text style={[styles.networkNameText, { color: ink }]} numberOfLines={1}>
                              {user.self ? `${user.name} · This phone` : user.name}
                            </Text>
                            <Text style={styles.networkSubtextText} numberOfLines={1}>
                              {user.blocked ? "Blocked" : user.ip || "Connected"}
                            </Text>
                          </View>
                          {user.self ? null : (
                            <Pressable onPress={() => toggleUser(user)}>
                              <Text style={{ color: user.blocked ? "#0A84FF" : "#FF3B30", fontSize: 17, fontWeight: "600" }}>
                                {user.blocked ? "Unblock" : "Block"}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                        {index < users.length - 1 ? <View style={[styles.networkRowDivider, { backgroundColor: line }]} /> : null}
                      </View>
                    ))
                  )}
                </Chrome>
                {userNote ? <Text style={[styles.wifiHeaderDesc, { marginTop: 12 }]}>{userNote}</Text> : null}
              </>
            ) : null}
          </ScrollView>
        </Animated.View>
      </SafeAreaView>
      <Modal visible={deviceAsk != null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setDeviceAsk(null)}>
        <View style={styles.popupBackdrop}>
          <Chrome effect="regular" colorScheme={dark ? "dark" : "light"} style={styles.glassPopup}>
            <Text style={[styles.popupTitle, { color: ink }]}>
              {deviceAsk === "reset" ? "Reset Factory Settings?" : deviceAsk === "off" ? "Shut down the MiFi?" : "Restart the MiFi?"}
            </Text>
            <Text style={[styles.popupBody, { color: dark ? "rgba(235,235,245,0.7)" : "rgba(60,60,67,0.72)" }]}>
              {deviceAsk === "reset" ? "This clears the device settings and restores the factory setup." : "The device will disconnect while this finishes."}
            </Text>
            <View style={styles.popupActions}>
              <Pressable onPress={() => setDeviceAsk(null)} style={styles.popupButton}>
                <Text style={[styles.popupCancel, { color: ink }]}>Cancel</Text>
              </Pressable>
              <View style={styles.popupActionDivider} />
              <Pressable onPress={runDeviceAsk} style={styles.popupButton}>
                <Text style={[styles.popupJoin, { color: deviceAsk === "reset" ? "#FF3B30" : ink }]}>
                  {deviceAsk === "reset" ? "Reset" : deviceAsk === "off" ? "Shut Down" : "Restart"}
                </Text>
              </Pressable>
            </View>
          </Chrome>
        </View>
      </Modal>
    </View>
  );
}

function MessagesScreen() {
  const dark = useColorScheme() === "dark";
  const ink = dark ? "#FFFFFF" : "#000000";
  const pageBg = dark ? "#000000" : "#FFFFFF";
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const searchFieldRef = useRef<TextFieldRef>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("messages");
  const [chats, setChats] = useState<Chat[]>(DEFAULT_CHATS);
  const [phoneBook, setPhoneBook] = useState<SavedContact[]>([]);
  const [showContacts, setShowContacts] = useState(false);
  const [contactsLive, setContactsLive] = useState(false);
  const [contactQuery, setContactQuery] = useState("");
  const sheetY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const sheetDim = useRef(new Animated.Value(0)).current;
  const sheetIn = useRef(new Animated.Value(0)).current;
  const sheetEnter = useRef(0);
  const [saveFor, setSaveFor] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [deviceOnline, setDeviceOnline] = useState(false);
  const [connectedSsid, setConnectedSsid] = useState<string | null>(null);
  const [connectedIp, setConnectedIp] = useState<string>("192.168.2.1");
  const [signalLevel, setSignalLevel] = useState(0);
  const [showWifiModal, setShowWifiModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsPane, setSettingsPane] = useState<SettingsPane | null>(null);
  const wifiX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const wifiIn = useRef(new Animated.Value(0)).current;
  const wifiEnter = useRef(0);
  const settingsX = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const settingsIn = useRef(new Animated.Value(0)).current;
  const settingsEnter = useRef(0);
  const navBlend = useRef(new Animated.Value(0)).current;
  const headerIcon = useRef(new Animated.Value(0)).current;
  const gearOpacity = useRef(headerIcon.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })).current;
  const backOpacity = useRef(headerIcon.interpolate({ inputRange: [0, 1], outputRange: [0, 1] })).current;
  const searchBlend = useRef(new Animated.Value(0)).current;
  const selectBlend = useRef(new Animated.Value(0)).current;
  const searchPad = useRef(new Animated.Value(Math.max(insets.bottom, BAR_GAP))).current;
  const sheetKeyboard = useRef(new Animated.Value(0)).current;
  const [selectingAll, setSelectingAll] = useState(false);
  const [bulkAsk, setBulkAsk] = useState(false);

  const openWifi = () => {
    headerIcon.setValue(1);
    wifiX.setValue(SCREEN_WIDTH * 0.18);
    wifiIn.setValue(0);
    setShowWifiModal(true);
    Animated.timing(navBlend, {
      toValue: 1,
      duration: 120,
      easing: Easing.bezier(0.2, 0.9, 0.3, 1),
      useNativeDriver: true,
    }).start();
    cancelAnimationFrame(wifiEnter.current);
    wifiEnter.current = requestAnimationFrame(() => {
      Animated.parallel([
        Animated.spring(wifiX, {
          toValue: 0,
          useNativeDriver: true,
          friction: 8,
          tension: 80,
        }),
        Animated.timing(wifiIn, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const closeWifi = () => {
    cancelAnimationFrame(wifiEnter.current);
    headerIcon.setValue(0);
    Animated.timing(navBlend, {
      toValue: 0,
      duration: 120,
      easing: Easing.bezier(0.2, 0.9, 0.3, 1),
      useNativeDriver: true,
    }).start();
    Animated.parallel([
      Animated.timing(wifiX, {
        toValue: SCREEN_WIDTH,
        duration: 220,
        easing: Easing.bezier(0.4, 0, 1, 1),
        useNativeDriver: true,
      }),
      Animated.timing(wifiIn, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setShowWifiModal(false);
    });
  };

  const openSettings = () => {
    headerIcon.setValue(1);
    setSettingsPane(null);
    settingsX.setValue(SCREEN_WIDTH * 0.18);
    settingsIn.setValue(0);
    setShowSettings(true);
    Animated.timing(navBlend, {
      toValue: 1,
      duration: 120,
      easing: Easing.bezier(0.2, 0.9, 0.3, 1),
      useNativeDriver: true,
    }).start();
    cancelAnimationFrame(settingsEnter.current);
    settingsEnter.current = requestAnimationFrame(() => {
      Animated.parallel([
        Animated.spring(settingsX, {
          toValue: 0,
          useNativeDriver: true,
          friction: 8,
          tension: 80,
        }),
        Animated.timing(settingsIn, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const closeSettings = () => {
    cancelAnimationFrame(settingsEnter.current);
    headerIcon.setValue(0);
    setSettingsPane(null);
    Animated.timing(navBlend, {
      toValue: 0,
      duration: 120,
      easing: Easing.bezier(0.2, 0.9, 0.3, 1),
      useNativeDriver: true,
    }).start();
    Animated.parallel([
      Animated.timing(settingsX, {
        toValue: SCREEN_WIDTH,
        duration: 220,
        easing: Easing.bezier(0.4, 0, 1, 1),
        useNativeDriver: true,
      }),
      Animated.timing(settingsIn, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setShowSettings(false);
    });
  };

  const [openId, setOpenId] = useState<string | null>(null);
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const bottomPad = useRef(new Animated.Value(insets.bottom || 0)).current;
  const keyboardOpen = useRef(false);
  const contactsOpenRef = useRef(false);
  const insetBottom = useRef(insets.bottom);
  insetBottom.current = insets.bottom || 0;
  const readIds = useRef(new Set<string>());
  const knownMessageIds = useRef<Set<string> | null>(null);
  const rawStamp = useRef("");
  const deviceDeletedIds = useRef(new Set<string>());
  const [notice, setNotice] = useState<{ name: string; text: string; otp: string | null } | null>(null);
  const noticeY = useRef(new Animated.Value(-180)).current;
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const openIdRef = useRef<string | null>(null);
  openIdRef.current = openId;
  const connectedRef = useRef(isConnected);
  connectedRef.current = isConnected;
  const connectedSsidRef = useRef(connectedSsid);
  connectedSsidRef.current = connectedSsid;
  const allowChatSave = useRef(false);
  const reconnectBusy = useRef(false);
  const pullBusy = useRef(false);
  const leftApp = useRef(false);
  const notifyMissed = useRef(false);
  const watchGen = useRef(0);
  const seenReady = useRef<Promise<void>>(Promise.resolve());
  const reconnectRef = useRef<() => Promise<void>>(async () => {});
  const pullRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let alive = true;
    seenReady.current = loadSeenIds().then((ids) => {
      if (!alive || !ids) return;
      knownMessageIds.current = new Set(ids);
      notifyMissed.current = true;
    });
    loadChatCache<Chat>().then((cached) => {
      if (!alive) return;
      if (cached.length > 0) {
        setChats((current) => (current.length > 0 ? current : cached));
      }
      allowChatSave.current = true;
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!allowChatSave.current) return;
    const timer = setTimeout(() => saveChatCache(chats), 600);
    return () => clearTimeout(timer);
  }, [chats]);

  useEffect(() => {
    let alive = true;
    const reconnect = async () => {
      if (reconnectBusy.current) return;
      const session = await loadSession();
      if (!alive || !session) return;
      reconnectBusy.current = true;
      try {
        const status = await fetchRouterStatus(session.ip, 5000);
        if (!alive) return;
        if (status && session.ssid && status.ssid && status.ssid !== session.ssid) {
          if (connectedRef.current) {
            connectedRef.current = false;
            setIsConnected(false);
            setDeviceOnline(false);
          }
          return;
        }
        if (connectedRef.current) return;
        const ok = await loginToRouter(session.ip, session.username, session.password);
        if (!ok || !alive || connectedRef.current) return;
        connectedRef.current = true;
        setConnectedIp(session.ip);
        setConnectedSsid(status?.ssid || session.ssid);
        setIsConnected(true);
        setDeviceOnline(true);
        ensureAlerts();
      } finally {
        reconnectBusy.current = false;
      }
    };
    reconnectRef.current = () => reconnect().catch(() => undefined);
    const beginBackgroundWatch = () => {
      const gen = watchGen.current + 1;
      watchGen.current = gen;
      const run = async () => {
        while (watchGen.current === gen && AppState.currentState !== "active") {
          await reconnectRef.current();
          await pullRef.current();
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      };
      run();
    };
    ensureAlerts();
    const start = setTimeout(reconnect, 300);
    const timer = setInterval(reconnect, 3000);
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        watchGen.current += 1;
        reconnectRef.current();
        pullRef.current();
      } else {
        leftApp.current = true;
        beginBackgroundWatch();
      }
    });
    return () => {
      alive = false;
      watchGen.current += 1;
      clearTimeout(start);
      clearInterval(timer);
      appState.remove();
    };
  }, []);

  useEffect(() => {
    if (!isConnected) return;
    let alive = true;
    const pull = async () => {
      if (pullBusy.current) return;
      pullBusy.current = true;
      try {
        await seenReady.current;
        let raw = await fetchRouterMessages(connectedIp);
        if (!alive) return;
        if (raw == null) {
          const session = await loadSession();
          if (session && session.ip === connectedIp) {
            const ok = await loginToRouter(session.ip, session.username, session.password);
            if (ok && alive) raw = await fetchRouterMessages(connectedIp, 4000);
          }
        }
        if (!alive) return;
        if (raw == null) {
          setDeviceOnline((online) => (online ? false : online));
          return;
        }
        let stamp = "";
        for (const message of raw) stamp += `${message.id}:${message.tag};`;
        if (stamp === rawStamp.current) {
          setDeviceOnline((online) => (online ? online : true));
          return;
        }
        rawStamp.current = stamp;
        setDeviceOnline((online) => (online ? online : true));
        if (raw.length === 0) return;
        const fresh = convertRouterMessagesToChats(raw);
        const openedNow = openIdRef.current;
        const novelChats: string[] = [];
        let incoming: { id: string; name: string; text: string } | null = null;
        if (knownMessageIds.current == null) {
          knownMessageIds.current = new Set();
          for (const chat of fresh) {
            for (const message of chat.messages) knownMessageIds.current.add(message.id);
          }
          saveSeenIds(Array.from(knownMessageIds.current));
        } else {
          for (const chat of fresh) {
            for (const message of chat.messages) {
              if (knownMessageIds.current.has(message.id)) continue;
              knownMessageIds.current.add(message.id);
              if (!message.outgoing && !message.id.startsWith("local-")) {
                novelChats.push(chat.id);
                incoming = { id: chat.id, name: chat.name, text: message.text };
              }
            }
          }
        }
        if (novelChats.length > 0) {
          const inOpenChat = novelChats.some((chatId) => chatId === openedNow);
          playMessageSound(inOpenChat ? "received" : "notice");
          hapticReceive();
          if (incoming && (AppState.currentState !== "active" || leftApp.current || notifyMissed.current)) {
            const otp = extractOtp(incoming.text);
            alertMessage(otp ? `OTP ${otp}` : incoming.name, incoming.text);
          }
          saveSeenIds(Array.from(knownMessageIds.current));
          if (AppState.currentState === "active") {
            leftApp.current = false;
            notifyMissed.current = false;
          }
          if (incoming && incoming.id !== openedNow) {
            const otp = extractOtp(incoming.text);
            setNotice({ name: incoming.name, text: incoming.text, otp });
            if (otp) {
              import("expo-clipboard")
                .then((clipboard) => clipboard.setStringAsync(otp))
                .catch(() => undefined);
            }
            noticeY.setValue(-180);
            Animated.timing(noticeY, {
              toValue: 0,
              duration: 220,
              easing: Easing.bezier(0.2, 0.9, 0.3, 1),
              useNativeDriver: true,
            }).start();
            if (noticeTimer.current) clearTimeout(noticeTimer.current);
            noticeTimer.current = setTimeout(() => {
              Animated.timing(noticeY, { toValue: -180, duration: 180, useNativeDriver: true }).start(({ finished }) => {
                if (finished) setNotice(null);
              });
            }, 4500);
          }
        }
        if (openedNow) {
          const openChat = fresh.find((chat) => chat.id === openedNow);
          if (openChat?.unread) {
            readIds.current.add(openedNow);
            const incoming = openChat.messages.filter((message) => !message.outgoing).map((message) => message.id);
            markRouterMessagesRead(incoming, connectedIp).catch(() => {});
          }
        }
        if (AppState.currentState === "active") notifyMissed.current = false;
        startTransition(() => setChats((previous) => {
          const cached = previous.filter((chat) => chat.folder === "deleted" || chat.folder === "spam");
          const hidden = new Set(deviceDeletedIds.current);
          for (const chat of cached) {
            for (const message of chat.messages) hidden.add(message.id);
          }
          const liveChats = fresh
            .map((chat): Chat | null => {
              const stayRead = readIds.current.has(chat.id) || chat.id === openedNow;
              const old = previous.find((item) => item.id === chat.id && item.folder === "messages");
              const seen = new Set(chat.messages.map((message) => `${message.outgoing}:${message.text}`));
              const pending = (old?.messages ?? []).filter(
                (message) => message.id.startsWith("local-") && !seen.has(`true:${message.text}`),
              );
              const messages = chat.messages.filter((message) => !hidden.has(message.id));
              if (messages.length === 0 && pending.length === 0) return null;
              return {
                ...chat,
                folder: "messages" as const,
                unread: stayRead ? false : chat.unread,
                messages: pending.length > 0 ? [...messages, ...pending] : messages,
                preview: pending.length > 0 ? pending[pending.length - 1].text : messages[messages.length - 1]?.text || chat.preview,
              };
            })
            .filter((chat): chat is Chat => chat != null);
          const next = [...liveChats, ...cached];
          if (inboxStamp(previous) === inboxStamp(next)) return previous;
          return next;
        }));
      } catch {
        // silent
      } finally {
        pullBusy.current = false;
      }
    };
    pullRef.current = () => pull().catch(() => undefined);
    pull();
    const interval = setInterval(pull, 2000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [isConnected, connectedIp]);

  useEffect(() => {
    if (!isConnected) {
      setSignalLevel(0);
      return;
    }
    let alive = true;
    const pullSignal = async () => {
      const status = await fetchRouterStatus(connectedIp, 5000);
      if (!alive || !status) return;
      if (connectedSsidRef.current && status.ssid && status.ssid !== connectedSsidRef.current) {
        setIsConnected(false);
        setDeviceOnline(false);
        return;
      }
      const level = Number(status.signalbar);
      if (!Number.isNaN(level)) setSignalLevel((current) => (current === level ? current : level));
    };
    pullSignal();
    const timer = setInterval(pullSignal, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [isConnected, connectedIp]);

  const dismissSearch = () => {
    inputRef.current?.blur();
    searchFieldRef.current?.blur();
    searchFieldRef.current?.clear();
    Keyboard.dismiss();
    setQuery("");
    setIsFocused(false);
    keyboardOpen.current = false;
    Animated.timing(searchPad, {
      toValue: Math.max(insetBottom.current, BAR_GAP),
      duration: Platform.OS === "ios" ? 220 : 180,
      easing: Easing.bezier(0.2, 0.9, 0.3, 1),
      useNativeDriver: false,
    }).start();
  };

  const searchOpen = isFocused || query.length > 0;
  useEffect(() => {
    Animated.timing(searchBlend, {
      toValue: searchOpen ? 1 : 0,
      duration: 180,
      easing: Easing.bezier(0.2, 0.9, 0.3, 1),
      useNativeDriver: true,
    }).start();
  }, [searchBlend, searchOpen]);

  useEffect(() => {
    Animated.timing(selectBlend, {
      toValue: selectingAll ? 1 : 0,
      duration: 180,
      easing: Easing.bezier(0.2, 0.9, 0.3, 1),
      useNativeDriver: true,
    }).start();
  }, [selectBlend, selectingAll]);

  const navAnim = useRef(new Animated.Value(0)).current;
  const threadIn = useRef(new Animated.Value(0)).current;
  const threadEnter = useRef(0);
  const lastChatRef = useRef<Chat | null>(null);

  const labelChat = (chat: Chat): Chat => {
    const saved = lookupName(chat.phone || chat.name, phoneBook);
    const shown = saved || chat.phone || chat.name;
    const parts = shown.split(/\s+/).filter(Boolean);
    const initials = saved
      ? (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : shown.slice(0, 2)).toUpperCase()
      : chat.initials;
    return {
      ...chat,
      name: shown,
      shortName: shown.length > 16 ? `${shown.slice(0, 14)}…` : shown,
      initials,
    };
  };

  const matchedChat = chats.find((chat) => chat.id === openId);
  if (matchedChat) {
    lastChatRef.current = labelChat(matchedChat);
  }
  const activeChat = (matchedChat ? labelChat(matchedChat) : null) || lastChatRef.current;

  useEffect(() => {
    loadPhoneBook().then(setPhoneBook).catch(() => undefined);
  }, []);

  const openContactsSheet = () => {
    setContactsLive(true);
    contactsOpenRef.current = true;
    Keyboard.dismiss();
    hapticSelection();
    sheetY.stopAnimation();
    sheetDim.stopAnimation();
    sheetIn.stopAnimation();
    sheetY.setValue(SCREEN_HEIGHT * 0.22);
    sheetDim.setValue(0);
    sheetIn.setValue(0);
    setShowContacts(true);
    cancelAnimationFrame(sheetEnter.current);
    sheetEnter.current = requestAnimationFrame(() => {
      Animated.parallel([
        Animated.spring(sheetY, {
          toValue: 0,
          useNativeDriver: true,
          friction: 8,
          tension: 80,
        }),
        Animated.timing(sheetIn, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(sheetDim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const closeContactsSheet = (after?: () => void) => {
    cancelAnimationFrame(sheetEnter.current);
    Keyboard.dismiss();
    sheetY.stopAnimation();
    sheetDim.stopAnimation();
    sheetIn.stopAnimation();
    Animated.parallel([
      Animated.timing(sheetY, {
        toValue: SCREEN_HEIGHT,
        duration: 220,
        easing: Easing.bezier(0.4, 0, 1, 1),
        useNativeDriver: true,
      }),
      Animated.timing(sheetIn, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(sheetDim, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      contactsOpenRef.current = false;
      setShowContacts(false);
      setContactQuery("");
      after?.();
    });
  };

  const openSavedContact = (person: SavedContact) => {
    hapticSelection();
    const existing = chats.find((chat) => samePhone(chat.phone || chat.name, person.phone));
    if (existing) {
      closeContactsSheet(() => {
        openThread(existing.id);
      });
      return;
    }
    const created: Chat = {
      id: `chat-${person.phone}`,
      name: person.name,
      phone: person.phone,
      shortName: person.name,
      initials: person.name.slice(0, 2).toUpperCase(),
      preview: "New message",
      time: "",
      dayLabel: "Today",
      service: "Text Message · SMS",
      folder: "messages",
      messages: [],
    };
    setChats((list) => [created, ...list]);
    lastChatRef.current = created;
    closeContactsSheet(() => {
      openThread(created.id);
    });
  };

  const confirmSaveContact = async () => {
    if (!saveFor || !saveName.trim()) return;
    const saved = await savePhoneContact(saveName.trim(), saveFor).catch(() => false);
    if (saved) {
      const next = await loadPhoneBook().catch(() => phoneBook);
      setPhoneBook(next);
    }
    setSaveFor(null);
    setSaveName("");
  };

  const openThread = (id: string) => {
    Keyboard.dismiss();
    readIds.current.add(id);
    const chat = chats.find((c) => c.id === id);
    if (chat) {
      lastChatRef.current = { ...chat, unread: false };
      const incoming = chat.messages.filter((message) => !message.outgoing).map((message) => message.id);
      markRouterMessagesRead(incoming, connectedIp).catch(() => {});
    }
    setChats((list) => list.map((c) => (c.id === id ? { ...c, unread: false } : c)));
    navAnim.setValue(0);
    threadIn.setValue(0);
    setOpenId(id);
    cancelAnimationFrame(threadEnter.current);
    threadEnter.current = requestAnimationFrame(() => {
      Animated.parallel([
        Animated.spring(navAnim, {
          toValue: 1,
          useNativeDriver: true,
          friction: 8,
          tension: 80,
        }),
        Animated.timing(threadIn, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const closeThread = () => {
    cancelAnimationFrame(threadEnter.current);
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(navAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.bezier(0.4, 0, 1, 1),
        useNativeDriver: true,
      }),
      Animated.timing(threadIn, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setOpenId(null);
      }
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        return gesture.x0 <= 45 && gesture.dx > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2;
      },
      onPanResponderGrant: () => {
        Keyboard.dismiss();
      },
      onPanResponderMove: (_, gesture) => {
        const progress = Math.max(0, Math.min(1, 1 - gesture.dx / SCREEN_WIDTH));
        navAnim.setValue(progress);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SCREEN_WIDTH * 0.28 || gesture.vx > 0.5) {
          const currentProgress = Math.max(0, Math.min(1, 1 - gesture.dx / SCREEN_WIDTH));
          const duration = Math.max(120, currentProgress * 260);
          Animated.timing(navAnim, {
            toValue: 0,
            duration,
            easing: Easing.bezier(0.22, 0.61, 0.36, 1),
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (finished) setOpenId(null);
          });
        } else {
          Animated.spring(navAnim, {
            toValue: 1,
            friction: 9,
            tension: 110,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  const messagesTranslateX = navAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -SCREEN_WIDTH * 0.28],
  });

  const threadTranslateX = navAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_WIDTH, 0],
  });

  const dimOpacity = navAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.2],
  });

  useEffect(() => {
    if (!keyboardOpen.current) {
      bottomPad.setValue(insetBottom.current);
      searchPad.setValue(Math.max(insetBottom.current, BAR_GAP));
    }
  }, [bottomPad, searchPad, insets.bottom]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (event) => {
      if (contactsOpenRef.current) {
        Animated.timing(sheetKeyboard, {
          toValue: event.endCoordinates.height + BAR_GAP,
          duration: Platform.OS === "ios" ? (event.duration ?? 220) : 180,
          easing: Easing.bezier(0.2, 0.9, 0.3, 1),
          useNativeDriver: false,
        }).start();
        return;
      }
      keyboardOpen.current = true;
      setIsFocused(true);
      Animated.timing(searchPad, {
        toValue: event.endCoordinates.height + BAR_GAP,
        duration: Platform.OS === "ios" ? (event.duration ?? 220) : 180,
        easing: Easing.bezier(0.2, 0.9, 0.3, 1),
        useNativeDriver: false,
      }).start();
    });

    const hideSub = Keyboard.addListener(hideEvent, (event) => {
      if (contactsOpenRef.current) {
        Animated.timing(sheetKeyboard, {
          toValue: 0,
          duration: Platform.OS === "ios" ? (event.duration ?? 200) : 160,
          easing: Easing.bezier(0.2, 0.9, 0.3, 1),
          useNativeDriver: false,
        }).start();
        return;
      }
      keyboardOpen.current = false;
      setIsFocused(false);
      Animated.timing(searchPad, {
        toValue: Math.max(insetBottom.current, BAR_GAP),
        duration: Platform.OS === "ios" ? (event.duration ?? 200) : 160,
        easing: Easing.bezier(0.2, 0.9, 0.3, 1),
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [searchPad]);

  const trimmed = query.trim().toLowerCase();
  const searching = trimmed.length > 0;
  const folder: InboxFilter = filter === "deleted" ? "deleted" : filter === "spam" ? "spam" : "messages";
  const visible = chats.map(labelChat).filter((chat) => {
    if (chat.folder !== folder) return false;
    if (!trimmed) return true;
    return (
      chat.name.toLowerCase().includes(trimmed) ||
      chat.phone.toLowerCase().includes(trimmed) ||
      chat.preview.toLowerCase().includes(trimmed)
    );
  });

  const rowActions = useRef<RowActions>({
    open: () => undefined,
    reveal: () => undefined,
    remove: () => undefined,
  });
  rowActions.current.open = (id) => {
    setSwipedId(null);
    openThread(id);
  };
  rowActions.current.reveal = (id) => setSwipedId(id);
  rowActions.current.remove = (id) => {
    hapticDeleteAsk();
    setPendingDelete(id);
  };

  const askDelete = (id: string) => {
    rowActions.current.remove(id);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    hapticDeleteConfirm();
    removeChat(pendingDelete);
    setPendingDelete(null);
  };

  const askDeleteAll = () => {
    if (visible.length === 0) return;
    hapticDeleteAsk();
    setBulkAsk(true);
  };

  const archiveChat = (chat: Chat): Chat => {
    for (const message of chat.messages) {
      if (!message.id || message.id.startsWith("local-") || message.id.startsWith("cache-")) continue;
      deviceDeletedIds.current.add(message.id);
      deleteRouterMessage(message.id, connectedIp).catch(() => undefined);
    }
    return { ...chat, id: `cache-${chat.id}-${Date.now()}`, folder: "deleted" };
  };

  const confirmBulkDelete = () => {
    const ids = new Set(visible.map((chat) => chat.id));
    const permanent = folder === "deleted";
    hapticDeleteConfirm();
    setChats((list) =>
      list.flatMap((chat) => {
        if (!ids.has(chat.id)) return [chat];
        if (permanent || chat.folder === "deleted") return [];
        return [archiveChat(chat)];
      }),
    );
    setBulkAsk(false);
    setSelectingAll(false);
  };

  const removeChat = (id: string) => {
    setSwipedId(null);
    const targetChat = chats.find((chat) => chat.id === id);
    if (targetChat && targetChat.folder !== "deleted") archiveChat(targetChat);
    setChats((list) =>
      list.flatMap((chat) => {
        if (chat.id !== id) return [chat];
        if (chat.folder === "deleted") return [];
        return [{ ...chat, id: `cache-${chat.id}-${Date.now()}`, folder: "deleted" as const }];
      }),
    );
    if (openId === id) closeThread();
  };

  const sendMessage = async (id: string, text: string) => {
    playMessageSound("sent");
    hapticSend();
    const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const targetChat = chats.find((c) => c.id === id);
    setChats((list) =>
      list.map((chat) =>
        chat.id === id
          ? {
              ...chat,
              preview: text,
              time,
              dayLabel: `Today ${time}`,
              messages: [...chat.messages, { id: `local-${Date.now()}`, text, outgoing: true, time }],
            }
          : chat,
      ),
    );
    if (targetChat) {
      try {
        await sendRouterMessage(targetChat.phone || targetChat.name, text, connectedIp);
      } catch (e) {
        console.warn("Router send error:", e);
      }
    }
  };

  const pendingChat = chats.find((chat) => chat.id === pendingDelete);
  const permanentDelete = pendingChat?.folder === "deleted";

  return (
    <View style={{ flex: 1, backgroundColor: pageBg, overflow: "hidden" }}>
      <Animated.View
        pointerEvents={openId ? "none" : "auto"}
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [{ translateX: messagesTranslateX }],
          },
        ]}
      >
        <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: "transparent" }}>
          <StatusBar style={dark ? "light" : "dark"} />

          <View className="z-30 h-[52px] flex-row items-center justify-between px-4">
            <View style={{ width: 72 }} />
            <View
              pointerEvents="box-none"
              style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}
            >
              <Text style={{ color: ink, fontSize: 17, fontWeight: "600", letterSpacing: -0.4 }}>
                Messages
              </Text>
              <Pressable
                onPress={openWifi}
                hitSlop={8}
                style={{ flexDirection: "row", alignItems: "center", marginTop: 1 }}
              >
                {isConnected ? (
                  <View style={{ marginRight: 6 }}>
                    <IosSignal level={deviceOnline ? signalLevel : 0} />
                  </View>
                ) : (
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 3.5,
                      backgroundColor: "#C7C7CC",
                      marginRight: 5,
                    }}
                  />
                )}
                <Text style={{ color: GRAY, fontSize: 11, fontWeight: "500", letterSpacing: -0.1 }}>
                  {isConnected ? `${connectedSsid || "Device"}${deviceOnline ? "" : " · waiting"}` : "Connect Device"}
                </Text>
              </Pressable>
            </View>
            <View style={{ width: 46 }} />
          </View>

          {visible.length === 0 ? (
            <Pressable className="flex-1 items-center justify-center px-8" onPress={Keyboard.dismiss}>
              <View
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: 38,
                  backgroundColor: dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <Icon
                  name={searching ? "magnifyingglass" : isConnected ? "bubble.left.fill" : "wifi"}
                  size={36}
                  color={ink}
                />
              </View>
              <Text className="text-[20px] font-semibold leading-[25px]" style={{ color: ink, letterSpacing: -0.45 }}>
                {searching
                  ? "No Results"
                  : filter === "deleted"
                  ? "No Recently Deleted"
                  : filter === "spam"
                  ? "No Spam"
                  : isConnected
                  ? "No Messages"
                  : "MiFi Device Not Connected"}
              </Text>
              <Text className="mt-3 text-center text-[15px] leading-[22px]" style={{ color: dark ? "rgba(235,235,245,0.7)" : "rgba(60,60,67,0.6)", letterSpacing: -0.23, maxWidth: 300, paddingHorizontal: 12 }}>
                {searching
                  ? `No messages for “${query.trim()}”.`
                  : filter === "deleted"
                  ? "Recently deleted messages will appear here."
                  : filter === "spam"
                  ? "Spam messages will appear here."
                  : isConnected
                  ? "Messages received by router will appear here."
                  : "Join your MiFi Wi-Fi to load messages from the device."}
              </Text>

              {!isConnected && !searching && filter === "messages" ? (
                <View style={{ marginTop: 28, alignItems: "center", paddingHorizontal: 8 }}>
                  <GlassPress onPress={openWifi}>
                    <Chrome className="h-[50px] flex-row items-center justify-center rounded-full px-7">
                      <Icon name="wifi" size={18} color={ink} weight="semibold" />
                      <Text style={{ color: ink, fontSize: 17, fontWeight: "600", marginLeft: 8, letterSpacing: -0.43 }}>
                        Connect to Internet
                      </Text>
                    </Chrome>
                  </GlassPress>
                </View>
              ) : null}
            </Pressable>
          ) : (
            <ScrollView
              className="flex-1"
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{ paddingTop: 18, paddingBottom: BAR_GAP }}
            >
              {visible.map((chat) => (
                <ChatRow
                  key={chat.id}
                  chat={chat}
                  dark={dark}
                  revealed={swipedId === chat.id}
                  selected={selectingAll}
                  actions={rowActions}
                />
              ))}
            </ScrollView>
          )}

          <Animated.View style={{ paddingBottom: searchPad }}>
            {Platform.OS === "ios" ? (
              <View style={{ height: 46, justifyContent: "center" }}>
                <Animated.View
                  pointerEvents={selectingAll ? "none" : "auto"}
                  style={{
                    opacity: selectBlend.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                    transform: [
                      {
                        translateY: selectBlend.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }),
                      },
                    ],
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 10 }}>
                    <Host colorScheme={dark ? "dark" : "light"} style={{ flex: 1, height: 46 }}>
                      <GlassEffectContainer spacing={16}>
                        <HStack
                          spacing={8}
                          alignment="center"
                          modifiers={[
                            padding({ horizontal: 14 }),
                            frame({ height: 46, maxWidth: 10000 }),
                            glassEffect({ glass: { variant: "regular", interactive: true }, shape: "capsule" }),
                          ]}
                        >
                          <SwiftImage systemName="magnifyingglass" size={17} color={GRAY} />
                          <TextField
                            ref={searchFieldRef}
                            placeholder="Search"
                            onTextChange={setQuery}
                            onFocusChange={setIsFocused}
                            modifiers={[textFieldStyle("plain"), frame({ maxWidth: 10000 })]}
                          />
                        </HStack>
                      </GlassEffectContainer>
                    </Host>
                    <Host matchContents colorScheme={dark ? "dark" : "light"} style={{ width: 46, height: 46 }}>
                      <Button
                        label={searchOpen ? "Close" : "Edit"}
                        systemImage={searchOpen ? "xmark" : "square.and.pencil"}
                        onPress={() => {
                          if (searchOpen) dismissSearch();
                          else openContactsSheet();
                        }}
                        modifiers={[
                          buttonStyle("glass"),
                          buttonBorderShape("circle"),
                          labelStyle("iconOnly"),
                          controlSize("large"),
                          frame({ width: 46, height: 46 }),
                        ]}
                      />
                    </Host>
                  </View>
                </Animated.View>
                {selectingAll ? (
                <Animated.View
                  pointerEvents="auto"
                  style={{
                    position: "absolute",
                    left: 16,
                    right: 16,
                    top: 0,
                    height: 46,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    transform: [
                      {
                        translateY: selectBlend.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
                      },
                      {
                        scale: selectBlend.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }),
                      },
                    ],
                  }}
                >
                  <Host matchContents colorScheme={dark ? "dark" : "light"} style={{ height: 46, backgroundColor: "transparent" }}>
                    <Button
                      label="Delete"
                      onPress={askDeleteAll}
                      modifiers={[
                        buttonStyle("glass"),
                        buttonBorderShape("capsule"),
                        controlSize("large"),
                        foregroundStyle("#FF3B30"),
                        padding({ horizontal: 18 }),
                        frame({ height: 46 }),
                      ]}
                    />
                  </Host>
                  <Host matchContents colorScheme={dark ? "dark" : "light"} style={{ width: 46, height: 46, backgroundColor: "transparent" }}>
                    <Button
                      label="Cancel"
                      systemImage="xmark"
                      onPress={() => setSelectingAll(false)}
                      modifiers={[
                        buttonStyle("glass"),
                        buttonBorderShape("circle"),
                        labelStyle("iconOnly"),
                        controlSize("large"),
                        frame({ width: 46, height: 46 }),
                      ]}
                    />
                  </Host>
                </Animated.View>
                ) : null}
              </View>
            ) : null}
            {Platform.OS === "ios" ? null : (
            <GlassContainer spacing={12} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16 }}>
              <Chrome
                plain
                interactive={false}
                effect="clear"
                style={{
                  height: 46,
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  borderRadius: 23,
                  paddingHorizontal: 14,
                  backgroundColor: "transparent",
                }}
              >
                <Pressable onPress={() => inputRef.current?.focus()}>
                  <Icon name="magnifyingglass" size={17} color={GRAY} weight="medium" />
                </Pressable>
                <TextInput
                  ref={inputRef}
                  value={query}
                  onChangeText={setQuery}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => {
                    if (!query.trim()) setIsFocused(false);
                  }}
                  placeholder="Search"
                  placeholderTextColor={GRAY}
                  returnKeyType="search"
                  autoCorrect={false}
                  autoCapitalize="none"
                  keyboardAppearance={dark ? "dark" : "light"}
                  selectionColor={ink}
                  className="mx-2 h-full flex-1 text-[16px] leading-[21px]"
                  style={{ color: ink, letterSpacing: -0.4, paddingVertical: 0, backgroundColor: "transparent" }}
                />
              </Chrome>
              <Pressable
                onPress={searchOpen ? dismissSearch : () => inputRef.current?.focus()}
                hitSlop={8}
                style={{ backgroundColor: "transparent" }}
              >
                <Chrome
                  plain
                  interactive={false}
                  effect="clear"
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "transparent",
                  }}
                >
                  <View style={{ width: 22, height: 22, alignItems: "center", justifyContent: "center" }}>
                    <Animated.View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        opacity: searchBlend.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                        transform: [
                          {
                            scale: searchBlend.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] }),
                          },
                        ],
                      }}
                    >
                      <Icon name="square.and.pencil" size={19} color={ink} />
                    </Animated.View>
                    <Animated.View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        opacity: searchBlend,
                        transform: [
                          {
                            scale: searchBlend.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }),
                          },
                        ],
                      }}
                    >
                      <Icon name="xmark" size={17} color={ink} weight="semibold" />
                    </Animated.View>
                  </View>
                </Chrome>
              </Pressable>
            </GlassContainer>
            )}
          </Animated.View>
        </SafeAreaView>

        {/* Backdrop Dimming during push/pop transition */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: "#000000",
              opacity: dimOpacity,
              zIndex: 40,
            },
          ]}
        />
      </Animated.View>

      {/* Thread Screen with iOS Push Animation & Edge Swipe Back */}
      {openId && activeChat && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: threadIn,
              transform: [{ translateX: threadTranslateX }],
              shadowColor: "#000000",
              shadowOffset: { width: -4, height: 0 },
              shadowOpacity: dark ? 0.5 : 0.16,
              shadowRadius: 12,
              elevation: 10,
              backgroundColor: pageBg,
              zIndex: 50,
            },
          ]}
          {...panResponder.panHandlers}
        >
          <ThreadScreen
            chat={activeChat}
            dark={dark}
            saved={Boolean(lookupName(activeChat.phone || activeChat.name, phoneBook))}
            freezeKeyboard={showContacts}
            onBack={closeThread}
            onSend={(text) => sendMessage(activeChat.id, text)}
            onOpenContacts={openContactsSheet}
            onSaveContact={() => {
              setSaveFor(activeChat.phone || activeChat.name);
              setSaveName("");
            }}
          />
        </Animated.View>
      )}

      {notice ? (
        <Animated.View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: insets.top + 6,
            left: 12,
            right: 12,
            zIndex: 180,
            transform: [{ translateY: noticeY }],
          }}
        >
          <Chrome
            effect="regular"
            colorScheme={dark ? "dark" : "light"}
            style={{
              borderRadius: 22,
              paddingHorizontal: 12,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Image source={require("./media/favicon_io/apple-touch-icon.png")} style={{ width: 36, height: 36, borderRadius: 10 }} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text numberOfLines={1} style={{ color: ink, fontSize: 15, fontWeight: "700", letterSpacing: -0.3 }}>
                {notice.name}
              </Text>
              <Text numberOfLines={2} style={{ color: dark ? "rgba(235,235,245,0.72)" : "rgba(60,60,67,0.72)", fontSize: 14, lineHeight: 18, marginTop: 2 }}>
                {notice.text}
              </Text>
              {notice.otp ? (
                <Text style={{ color: "#0A84FF", fontSize: 15, fontWeight: "700", marginTop: 4 }}>Code {notice.otp}</Text>
              ) : null}
            </View>
          </Chrome>
        </Animated.View>
      ) : null}

      {!openId ? (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: insets.top,
            left: 0,
            right: 0,
            height: 56,
            zIndex: 120,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "transparent",
          }}
        >
          <GlassPress
            onPress={() => {
              if (showWifiModal) closeWifi();
              else if (showSettings) {
                if (settingsPane) setSettingsPane(null);
                else closeSettings();
              } else openSettings();
            }}
            hitSlop={8}
          >
            <View style={{ width: 52, height: 52, alignItems: "center", justifyContent: "center" }}>
              <Chrome
                interactive={false}
                style={{
                  position: "absolute",
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                }}
              />
              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  width: 52,
                  height: 52,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: gearOpacity,
                }}
              >
                <Icon name="gearshape.fill" size={22} color={ink} weight="semibold" />
              </Animated.View>
              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  width: 52,
                  height: 52,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: backOpacity,
                }}
              >
                <Icon name="chevron.left" size={22} color={ink} weight="semibold" />
              </Animated.View>
            </View>
          </GlassPress>
          <Animated.View
            pointerEvents={showWifiModal || showSettings ? "none" : "auto"}
            style={{
              opacity: 1,
              transform: [
                {
                  translateX: navBlend.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 78],
                  }),
                },
              ],
            }}
          >
            <FilterMenu
              dark={dark}
              filter={filter}
              onFilter={(next) => {
                setFilter(next);
                setSelectingAll(false);
              }}
              onSelectAll={() => {
                hapticSelection();
                Keyboard.dismiss();
                setIsFocused(false);
                setSelectingAll(true);
              }}
            />
          </Animated.View>
        </View>
      ) : null}

      {showWifiModal ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              zIndex: 80,
              backgroundColor: pageBg,
              opacity: wifiIn,
              transform: [{ translateX: wifiX }],
            },
          ]}
        >
          <WifiSettingsPage
            deviceHost={isConnected ? connectedIp : null}
            deviceName={connectedSsid}
            signalLevel={signalLevel}
            onConnected={(newChats, ssid, ip) => {
              setIsConnected(true);
              setDeviceOnline(true);
              setConnectedSsid(ssid);
              if (ip) setConnectedIp(ip);
              setChats((previous) => {
                const kept = previous.filter((chat) => chat.folder === "deleted" || chat.folder === "spam");
                return [...newChats, ...kept];
              });
            }}
            onDisconnect={() => {
              connectedRef.current = false;
              setIsConnected(false);
              setDeviceOnline(false);
              setConnectedSsid(null);
              clearSession();
            }}
          />
        </Animated.View>
      ) : null}

      {showSettings ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              zIndex: 80,
              backgroundColor: pageBg,
              opacity: settingsIn,
              transform: [{ translateX: settingsX }],
            },
          ]}
        >
          <SettingsPage
            ip={connectedIp || "192.168.2.1"}
            pane={settingsPane}
            signalLevel={signalLevel}
            onOpen={setSettingsPane}
          />
        </Animated.View>
      ) : null}

      {contactsLive ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 200 }]} pointerEvents={showContacts ? "box-none" : "none"}>
          <Animated.View
            pointerEvents="auto"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: "#000000",
                opacity: sheetDim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, dark ? 0.6 : 0.28],
                }),
              },
            ]}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={() => closeContactsSheet()} />
          </Animated.View>
          <Animated.View
            style={{
              position: "absolute",
              top: insets.top + 8,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: dark ? "#1C1C1E" : "#FFFFFF",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              borderCurve: "continuous",
              overflow: "hidden",
              opacity: sheetIn,
              transform: [{ translateY: sheetY }],
            }}
          >
            <Animated.View style={{ flex: 1, paddingBottom: sheetKeyboard }}>
            <View style={{ height: 56, marginTop: 22, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", backgroundColor: "transparent" }}>
              <Text style={{ color: dark ? "#FFFFFF" : "#000000", fontSize: 17, fontWeight: "700", letterSpacing: -0.4 }}>New Message</Text>
              <View style={{ position: "absolute", right: 16, top: 10 }}>
                <Host matchContents colorScheme={dark ? "dark" : "light"} style={{ width: 36, height: 36, backgroundColor: "transparent" }}>
                  <Button
                    label="Close"
                    systemImage="xmark"
                    onPress={() => closeContactsSheet()}
                    modifiers={[
                      buttonStyle("glass"),
                      buttonBorderShape("circle"),
                      labelStyle("iconOnly"),
                      controlSize("large"),
                      frame({ width: 36, height: 36 }),
                    ]}
                  />
                </Host>
              </View>
            </View>
            <View style={{ paddingHorizontal: 16, marginTop: BAR_GAP, marginBottom: BAR_GAP, backgroundColor: "transparent" }}>
              <Host colorScheme={dark ? "dark" : "light"} style={{ height: 46, backgroundColor: "transparent" }}>
                <GlassEffectContainer spacing={16}>
                  <HStack
                    spacing={8}
                    alignment="center"
                    modifiers={[
                      padding({ horizontal: 14 }),
                      frame({ height: 46, maxWidth: 10000 }),
                      glassEffect({ glass: { variant: "regular", interactive: true }, shape: "capsule" }),
                    ]}
                  >
                    <SwiftImage systemName="magnifyingglass" size={17} color={GRAY} />
                    <TextField
                      placeholder="Search"
                      onTextChange={setContactQuery}
                      modifiers={[textFieldStyle("plain"), frame({ maxWidth: 10000 })]}
                    />
                  </HStack>
                </GlassEffectContainer>
              </Host>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1, backgroundColor: "transparent" }} contentContainerStyle={{ paddingTop: 0, paddingBottom: BAR_GAP }}>
              {phoneBook.filter((person) => {
                const q = contactQuery.trim().toLowerCase();
                if (!q) return true;
                return person.name.toLowerCase().includes(q) || person.phone.toLowerCase().includes(q);
              }).map((person, index, list) => {
                const parts = person.name.split(/\s+/).filter(Boolean);
                const initials = (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : person.name.slice(0, 2)).toUpperCase();
                return (
                  <Pressable key={`${person.phone}-${person.name}`} onPress={() => openSavedContact(person)} style={{ paddingLeft: 16 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingRight: 16 }}>
                      <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: dark ? "#3A3548" : "#E5E5EA", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                        <Text style={{ color: dark ? "#FFFFFF" : "#000000", fontSize: 15, fontWeight: "600" }}>{initials}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: dark ? "#FFFFFF" : "#000000", fontSize: 17, letterSpacing: -0.4 }} numberOfLines={1}>{person.name}</Text>
                        <Text style={{ color: "#30D158", fontSize: 15, marginTop: 1 }} numberOfLines={1}>{person.phone}</Text>
                        {index < list.length - 1 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)", marginTop: 10 }} /> : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
              {phoneBook.length === 0 ? (
                <Text style={{ color: GRAY, fontSize: 16, textAlign: "center", paddingVertical: 28 }}>No saved contacts</Text>
              ) : null}
            </ScrollView>
            </Animated.View>
          </Animated.View>
        </View>
      ) : null}

      <Modal visible={saveFor != null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setSaveFor(null)}>
        <View style={styles.popupBackdrop}>
          <Chrome effect="regular" style={styles.glassPopup}>
            <Text style={[styles.popupTitle, { color: ink }]}>Save Contact</Text>
            <Text style={[styles.popupBody, { color: dark ? "rgba(235,235,245,0.7)" : "rgba(60,60,67,0.72)" }]}>{saveFor}</Text>
            <TextInput
              value={saveName}
              onChangeText={setSaveName}
              placeholder="Name"
              placeholderTextColor="#8E8E93"
              autoCorrect={false}
              keyboardAppearance={dark ? "dark" : "light"}
              style={[styles.popupInput, { color: ink }]}
            />
            <View style={styles.popupActions}>
              <Pressable onPress={() => setSaveFor(null)} style={styles.popupButton}>
                <Text style={[styles.popupCancel, { color: ink }]}>Cancel</Text>
              </Pressable>
              <View style={styles.popupActionDivider} />
              <Pressable onPress={confirmSaveContact} style={styles.popupButton}>
                <Text style={[styles.popupJoin, { color: ink }]}>Save</Text>
              </Pressable>
            </View>
          </Chrome>
        </View>
      </Modal>

      <Modal visible={bulkAsk} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setBulkAsk(false)}>
        <View style={styles.popupBackdrop}>
          <Chrome effect="regular" style={styles.glassPopup}>
            <Text style={[styles.popupTitle, { color: ink }]}>{folder === "deleted" ? "Delete Permanently?" : "Delete Conversations?"}</Text>
            <Text style={[styles.popupBody, { color: dark ? "rgba(235,235,245,0.7)" : "rgba(60,60,67,0.72)" }]}>
              {folder === "deleted"
                ? "These conversations will be removed."
                : "These conversations will move to Recently Deleted."}
            </Text>
            <View style={styles.popupActions}>
              <Pressable onPress={() => setBulkAsk(false)} style={styles.popupButton}>
                <Text style={[styles.popupCancel, { color: ink }]}>Cancel</Text>
              </Pressable>
              <View style={styles.popupActionDivider} />
              <Pressable onPress={confirmBulkDelete} style={styles.popupButton}>
                <Text style={[styles.popupJoin, { color: "#FF3B30" }]}>Delete</Text>
              </Pressable>
            </View>
          </Chrome>
        </View>
      </Modal>

      <Modal visible={pendingDelete != null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setPendingDelete(null)}>
        <View style={styles.popupBackdrop}>
          <Chrome effect="regular" style={styles.glassPopup}>
            <Text style={[styles.popupTitle, { color: ink }]}>{permanentDelete ? "Delete Permanently?" : "Delete Conversation?"}</Text>
            <Text style={[styles.popupBody, { color: dark ? "rgba(235,235,245,0.7)" : "rgba(60,60,67,0.72)" }]}>
              {permanentDelete ? "This conversation will be removed." : "This conversation will move to Recently Deleted."}
            </Text>
            <View style={styles.popupActions}>
              <Pressable
                onPress={() => setPendingDelete(null)}
                style={styles.popupButton}
              >
                <Text style={[styles.popupCancel, { color: ink }]}>Cancel</Text>
              </Pressable>
              <View style={styles.popupActionDivider} />
              <Pressable onPress={confirmDelete} style={styles.popupButton}>
                <Text style={[styles.popupJoin, { color: ink }]}>Delete</Text>
              </Pressable>
            </View>
          </Chrome>
        </View>
      </Modal>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MessagesScreen />
    </SafeAreaProvider>
  );
}
