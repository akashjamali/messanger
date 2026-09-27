import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureAlerts(): Promise<void> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted) await Notifications.requestPermissionsAsync();
  } catch {
    // Notifications stay off if the phone declines.
  }
}

export async function alertMessage(title: string, body: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: title || "Message",
        body: body || "New message",
        sound: true,
      },
      trigger: null,
    });
  } catch {
    // The banner in the app still shows.
  }
}
