import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import { preloadOrbImages } from "../cookbooks/fable/components/ui/orb-images";
import { ME } from "../cookbooks/fable/data/people";
import { LogBox } from "react-native";
import {
  requestNotificationPermissions,
  setupNotificationResponseListener,
} from "../services/notification-service";
import {
  registerBackgroundSMSFetchAsync,
  attachBackgroundTaskLifecycleListener,
} from "../services/background-sms-task";

void SplashScreen.preventAutoHideAsync();

LogBox.ignoreLogs([
  "expo-notifications: Android Push notifications",
  "`expo-notifications` functionality is not fully supported in Expo Go",
  "expo-background-fetch: This library is deprecated",
  "`Background Fetch` functionality is not available in Expo Go",
  "Failed to register background fetch task",
]);

export const unstable_settings = { initialRouteName: "index" };

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  // Preload avatar assets before hiding splash screen
  useEffect(() => {
    let mounted = true;
    const preload =
      typeof ME.avatar === "number" ? preloadOrbImages([ME.avatar]) : Promise.resolve();
    preload.finally(() => {
      if (mounted) setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // ── Notification & Background Task Setup ──────────────────────────────────
  // This runs once on mount. Order matters:
  // 1. Request notification permissions first (user sees the system dialog)
  // 2. Register the background fetch task with the OS
  // 3. Attach the AppState listener that re-verifies registration on backgrounding
  // 4. Set up the notification tap → deep link handler
  useEffect(() => {
    // 1. Request notification permissions
    void requestNotificationPermissions();

    // 2. Register the background SMS fetch task with the OS BGTaskScheduler
    void registerBackgroundSMSFetchAsync();

    // 3. Re-verify task registration when app moves to background.
    //    iOS can silently drop task registrations after force-quit / memory pressure.
    const detachLifecycle = attachBackgroundTaskLifecycleListener();

    // 4. Handle notification taps → navigate to the correct chat thread
    const detachNotificationListener = setupNotificationResponseListener(
      (chatId) => {
        try {
          router.push({
            pathname: "/fable/chat/[id]",
            params: { id: chatId },
          });
        } catch (err) {
          console.error("[Layout] Deep link from notification failed:", err);
        }
      },
    );

    return () => {
      detachLifecycle();
      detachNotificationListener();
    };
  }, []);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <KeyboardProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="fable" />
          </Stack>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
