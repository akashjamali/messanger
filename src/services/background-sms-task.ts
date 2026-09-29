import Constants, { ExecutionEnvironment } from "expo-constants";
import * as BackgroundFetch from "expo-background-fetch";
import * as Network from "expo-network";
import * as TaskManager from "expo-task-manager";
import { createMMKV } from "react-native-mmkv";

import { useFable } from "../cookbooks/fable/data/store";
import {
  findContactByNumber,
  loadDeviceContacts,
  parseSMSTimestamp,
  parseSMSTimestampMillis,
} from "./contact-matcher";
import { triggerSMSNotification } from "./notification-service";
import { RouterAPI } from "./router-api";
import { generateNormalizedChatId } from "../utils/phone";
import type { SMSMessage } from "../types/router-chat";

export const BACKGROUND_SMS_FETCH_TASK = "BACKGROUND_SMS_FETCH_TASK";

const isExpoGo =
  Constants.appOwnership === "expo" ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const authStorage = createMMKV({ id: "router-auth-v1" });
const notificationStorage = createMMKV({ id: "router-notifications-v1" });

/**
 * Headless Background Polling Task Definition
 * Runs at the global module scope outside React component lifecycle.
 * In Expo Go, native BackgroundFetch is disabled by the Expo client shell;
 * it runs when deployed as a Development Client or standalone build.
 */
if (!isExpoGo) {
  try {
    TaskManager.defineTask(BACKGROUND_SMS_FETCH_TASK, async () => {
  try {
    // 1. Connection Gatekeeper (Fast Fail)
    const netState = await Network.getNetworkStateAsync();
    if (!netState.isConnected) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const routerIP =
      authStorage.getString("router_ip") ||
      RouterAPI.getRouterIP() ||
      "192.168.2.1";

    // Fast probe with strict 2000ms timeout
    const isReachable = await RouterAPI.probeIP(routerIP, 2000);
    if (!isReachable) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // 2. Credential Retrieval & Authentication
    let isLoggedIn = false;
    const session = await RouterAPI.checkSession(routerIP);
    if (session.isLoggedIn) {
      isLoggedIn = true;
    } else {
      const credsRaw = authStorage.getString("credentials");
      if (credsRaw) {
        try {
          const creds = JSON.parse(credsRaw);
          if (creds?.user && creds?.pass) {
            const loginRes = await RouterAPI.login(
              creds.user,
              creds.pass,
              routerIP,
            );
            isLoggedIn = loginRes.success;
          }
        } catch {}
      }
    }

    if (!isLoggedIn) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // 3. Silent API Fetch with strict timeout
    const smsList = await RouterAPI.fetchSMS(routerIP);
    if (!smsList || smsList.length === 0) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // 4. Strict Deduplication & Notification
    let notifiedList: string[] = [];
    try {
      const raw = notificationStorage.getString("notified_message_ids");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) notifiedList = parsed;
      }
    } catch {}

    const notifiedSet = new Set(notifiedList);
    let hasNewData = false;

    // Check if initial run: seed IDs to avoid spamming historical messages
    const isFirstRun = notifiedSet.size === 0;
    if (isFirstRun) {
      for (const msg of smsList) {
        notifiedSet.add(msg.id);
      }
      notificationStorage.set(
        "notified_message_ids",
        JSON.stringify(Array.from(notifiedSet).slice(-1000)),
      );
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Filter truly new incoming messages
    const newIncoming: SMSMessage[] = [];
    for (const msg of smsList) {
      if (!msg.fromMe && msg.tag !== "3" && !notifiedSet.has(msg.id)) {
        newIncoming.push(msg);
      }
    }

    if (newIncoming.length === 0) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Load contacts to format notification sender name
    const contacts = await loadDeviceContacts().catch(() => []);

    for (const msg of newIncoming) {
      notifiedSet.add(msg.id);
      hasNewData = true;

      const matched = findContactByNumber(msg.number, contacts);
      const title = matched ? matched.name : msg.number;

      const normalizedChatId =
        msg.chatId || generateNormalizedChatId(msg.number);

      // Safe notification trigger
      try {
        await triggerSMSNotification({
          id: msg.id,
          senderName: title,
          senderNumber: msg.number,
          content: msg.content,
          chatId: normalizedChatId,
        });
      } catch (err) {
        console.error("Background notification error:", err);
      }

      // Synchronize to Fable threads store
      try {
        const exactTime = parseSMSTimestamp(msg.date);
        const timestampMillis =
          msg.timestamp ?? parseSMSTimestampMillis(msg.date);

        useFable.getState().append(
          normalizedChatId,
          msg.content,
          "them",
          false,
          undefined,
          "sent",
          exactTime,
          msg.id,
          timestampMillis,
          false,
        );
      } catch {}
    }

    // 5. Synchronous MMKV Write-Back
    notificationStorage.set(
      "notified_message_ids",
      JSON.stringify(Array.from(notifiedSet).slice(-1000)),
    );

    return hasNewData
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
    } catch (error) {
      console.error("Headless background SMS fetch failed:", error);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
} catch {}
}

/**
 * Register the background fetch task with the OS
 */
export async function registerBackgroundSMSFetchAsync(): Promise<void> {
  if (isExpoGo) {
    // Expo Go does not support native background fetch because it is a shared sandbox.
    // In Expo Go, real-time polling runs automatically in useRouterChatStore.
    return;
  }
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_SMS_FETCH_TASK,
    );
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_SMS_FETCH_TASK, {
        minimumInterval: 15, // Frequency as often as allowed by the OS
        stopOnTerminate: false, // Keep alive when app is killed/terminated
        startOnBoot: true, // Start on device reboot
      });
    }
  } catch {
    // Suppress warning if runtime environment does not permit background registration
  }
}

/**
 * Unregister background fetch task
 */
export async function unregisterBackgroundSMSFetchAsync(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_SMS_FETCH_TASK,
    );
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SMS_FETCH_TASK);
    }
  } catch (err) {
    console.warn("Failed to unregister background fetch task:", err);
  }
}
