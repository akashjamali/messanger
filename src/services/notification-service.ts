import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// ─── Foreground Handler ───────────────────────────────────────────────────────

/**
 * Configure foreground notification behavior.
 * When the app IS in the foreground, incoming push notifications will still
 * show as banners/alerts with sound and badge updates.
 */
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (err) {
  console.warn("[Notifications] Failed to set notification handler:", err);
}

// ─── Channel Setup ────────────────────────────────────────────────────────────

/**
 * Configure the default Android notification channel.
 * On iOS, channels are ignored — behavior is controlled via notification content.
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync("sms_incoming", {
        name: "SMS Messages",
        description: "Incoming SMS messages from your router",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#007AFF",
        sound: "default",
        enableVibrate: true,
        showBadge: true,
      });
    } catch (err) {
      console.warn("[Notifications] Failed to set Android channel:", err);
    }
  }
}

// ─── Permission Request ───────────────────────────────────────────────────────

/**
 * Request notification permissions gracefully on app launch.
 * iOS requires explicit user consent for alerts, sound, and badge.
 * Returns true if permissions were granted.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          // Required for notifications to appear on lock screen in killed state
          allowCriticalAlerts: false,
          provideAppNotificationSettings: false,
        },
      });
      finalStatus = status;
    }

    await setupNotificationChannels();
    return finalStatus === "granted";
  } catch (err) {
    console.warn("[Notifications] Failed to request permissions:", err);
    return false;
  }
}

// ─── SMS Notification Trigger ─────────────────────────────────────────────────

/**
 * Schedule an immediate local push notification for an incoming SMS.
 *
 * iOS killed-state notes:
 * - `trigger: null` fires immediately — even from headless background context.
 * - `threadIdentifier` groups messages from the same sender on iOS lock screen.
 * - `sound: "default"` uses the system default SMS-style alert tone.
 * - `badge` increments the app icon badge count.
 *
 * This function is safe to call from TaskManager's headless background execution.
 */
export async function triggerSMSNotification(params: {
  id: string;
  senderName?: string;
  senderNumber: string;
  content: string;
  chatId: string;
}): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `sms-${params.id}`,
      content: {
        title: params.senderName || params.senderNumber,
        body: params.content,
        sound: "default",
        badge: 1,
        data: {
          chatId: params.chatId,
          messageId: params.id,
          senderNumber: params.senderNumber,
        },
        // iOS: Group notifications from the same sender into a thread on lock screen
        ...(Platform.OS === "ios"
          ? { threadIdentifier: `chat-${params.chatId}` }
          : { channelId: "sms_incoming" }),
      },
      trigger: null, // Fire immediately — safe in headless context
    });
  } catch (error) {
    console.error("[Notifications] Notification dispatch crash prevented:", error);
  }
}

// ─── Deep Link Response Listener ─────────────────────────────────────────────

/**
 * Register listener for notification taps to deep link directly into a chat.
 *
 * Handles two cases:
 * 1. App killed → user taps notification → cold launch via getLastNotificationResponseAsync
 * 2. App backgrounded → user taps notification → addNotificationResponseReceivedListener
 *
 * Returns a cleanup function for useEffect.
 */
export function setupNotificationResponseListener(
  onNavigate: (chatId: string) => void,
): () => void {
  try {
    // Case 1: App was opened from a cold start via notification tap.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const chatId = response?.notification?.request?.content?.data?.chatId;
        if (chatId) {
          // Defer navigation slightly to allow the React tree to mount first.
          setTimeout(() => onNavigate(String(chatId)), 500);
        }
      })
      .catch(() => {});

    // Case 2: App is backgrounded — user taps a notification banner.
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const chatId = response?.notification?.request?.content?.data?.chatId;
        if (chatId) {
          onNavigate(String(chatId));
        }
      },
    );

    return () => {
      try {
        subscription.remove();
      } catch {}
    };
  } catch {
    return () => {};
  }
}

// ─── OTP Extraction ───────────────────────────────────────────────────────────

/**
 * Detect and extract a numeric OTP code from an SMS body.
 * Returns null if no OTP-like pattern is found.
 */
export function extractOTP(text: string): string | null {
  if (!text) return null;
  const match =
    text.match(
      /(?:code|otp|pin|verification\s*code|is|secret)\s*[:=-]?\s*([0-9]{4,8})/i,
    ) || text.match(/\b([0-9]{4,8})\b/);
  return match ? match[1] || match[0] : null;
}
