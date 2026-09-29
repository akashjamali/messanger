import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Configure foreground notification behavior
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true, // Forces default iOS/Android alert sound
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (err) {
  console.warn("Failed to set notification handler:", err);
}

/**
 * Configure default notification channel on Android devices
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS === "android") {
    try {
      await Notifications.setNotificationChannelAsync("default", {
        name: "SMS Messages",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#007AFF",
        sound: "default",
      });
    } catch (err) {
      console.warn("Failed to set Android notification channel:", err);
    }
  }
}

/**
 * Request notification permissions gracefully on app launch
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    await setupNotificationChannels();
    return finalStatus === "granted";
  } catch (err) {
    console.warn("Failed to request notification permissions:", err);
    return false;
  }
}

/**
 * Schedule an immediate local push notification for an incoming SMS
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
      content: {
        title: params.senderName || params.senderNumber,
        body: params.content,
        sound: true, // Native iOS/Android default sound
        data: {
          chatId: params.chatId,
          messageId: params.id,
        },
      },
      trigger: null, // Fire immediately
    });
  } catch (error) {
    console.error("Notification crash prevented:", error);
  }
}

/**
 * Register listener for notification tap to deep link directly to chat
 */
export function setupNotificationResponseListener(
  onNavigate: (chatId: string) => void,
): () => void {
  try {
    // Check if app was opened via a notification tap on cold boot
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const chatId = response?.notification?.request?.content?.data?.chatId;
        if (chatId) {
          onNavigate(String(chatId));
        }
      })
      .catch(() => { });

    // Listen for notification taps while app is running in background or foreground
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
      } catch { }
    };
  } catch {
    return () => { };
  }
}

/**
 * Optional helper to detect and extract OTP from incoming SMS message body
 */
export function extractOTP(text: string): string | null {
  if (!text) return null;
  const match =
    text.match(/(?:code|otp|pin|verification\s*code|is|secret)\s*[:=-]?\s*([0-9]{4,8})/i) ||
    text.match(/\b([0-9]{4,8})\b/);
  return match ? match[1] || match[0] : null;
}
