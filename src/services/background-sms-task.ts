import Constants, { ExecutionEnvironment } from "expo-constants";
import * as BackgroundFetch from "expo-background-fetch";
import * as Network from "expo-network";
import * as TaskManager from "expo-task-manager";
import { createMMKV } from "react-native-mmkv";
import { AppState, type AppStateStatus } from "react-native";

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

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Must match BGTaskSchedulerPermittedIdentifiers in app.json infoPlist.
 * iOS 13+ silently drops any task not declared there.
 */
export const BACKGROUND_SMS_FETCH_TASK = "BACKGROUND_SMS_FETCH_TASK";

/**
 * The most aggressive interval iOS will honor in practice.
 * iOS enforces a minimum of ~15 minutes (900s) for BGAppRefresh regardless
 * of what we request here — this is just a hint.
 */
const MINIMUM_FETCH_INTERVAL_SECONDS = 60;

const isExpoGo =
  Constants.appOwnership === "expo" ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const authStorage = createMMKV({ id: "router-auth-v1" });
const notificationStorage = createMMKV({ id: "router-notifications-v1" });

// ─── Headless Task Definition ─────────────────────────────────────────────────

/**
 * TaskManager.defineTask MUST be called at module scope (outside React),
 * synchronously, before any app code runs — including in headless/killed state.
 *
 * In headless mode (app killed), iOS spawns a short-lived JS context.
 * This module is the entry point for that context via expo-task-manager.
 * Any async work beyond the OS-granted budget (~30s) will be silently aborted.
 */
if (!isExpoGo) {
  try {
    TaskManager.defineTask(BACKGROUND_SMS_FETCH_TASK, async () => {
      try {
        // ── 1. Network / WiFi Pre-Check ──────────────────────────────────────
        // Fast fail: don't attempt router connection on cellular.
        // This preserves battery score — iOS tracks BFetch result quality.
        const netState = await Network.getNetworkStateAsync();
        const isWifi =
          netState.isConnected &&
          netState.type === Network.NetworkStateType.WIFI;

        if (!isWifi) {
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // ── 2. Router Reachability Probe (2s strict timeout) ─────────────────
        const routerIP =
          authStorage.getString("router_ip") ||
          RouterAPI.getRouterIP() ||
          "192.168.2.1";

        const isReachable = await RouterAPI.probeIP(routerIP, 2000).catch(
          () => false,
        );
        if (!isReachable) {
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // ── 3. Session Auth ──────────────────────────────────────────────────
        let isLoggedIn = false;
        try {
          const session = await RouterAPI.checkSession(routerIP);
          if (session.isLoggedIn) {
            isLoggedIn = true;
          } else {
            const credsRaw = authStorage.getString("credentials");
            if (credsRaw) {
              const creds = JSON.parse(credsRaw);
              if (creds?.user && creds?.pass) {
                const loginRes = await RouterAPI.login(
                  creds.user,
                  creds.pass,
                  routerIP,
                );
                isLoggedIn = loginRes.success;
              }
            }
          }
        } catch {
          // Auth failure in background — exit silently.
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        if (!isLoggedIn) {
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // ── 4. Fetch SMS List ────────────────────────────────────────────────
        const smsList = await RouterAPI.fetchSMS(routerIP);
        if (!smsList || smsList.length === 0) {
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // ── 5. MMKV Deduplication (Synchronous Read) ─────────────────────────
        // MMKV is synchronous — safe to read in headless JS context.
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

        // First-run seed: avoid blasting notifications for all historical messages.
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

        // Filter for truly new incoming messages only
        const newIncoming: SMSMessage[] = smsList.filter(
          (msg) =>
            !msg.fromMe &&
            msg.tag !== "2" &&
            msg.tag !== "3" &&
            !notifiedSet.has(msg.id),
        );

        if (newIncoming.length === 0) {
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // ── 6. Load Contacts & Dispatch Notifications ────────────────────────
        const contacts = await loadDeviceContacts().catch(() => []);

        for (const msg of newIncoming) {
          notifiedSet.add(msg.id);
          hasNewData = true;

          const matched = findContactByNumber(msg.number, contacts);
          const senderName = matched ? matched.name : msg.number;
          const normalizedChatId =
            msg.chatId || generateNormalizedChatId(msg.number);

          // Push local notification — fire-and-forget with crash guard.
          try {
            await triggerSMSNotification({
              id: msg.id,
              senderName,
              senderNumber: msg.number,
              content: msg.content,
              chatId: normalizedChatId,
            });
          } catch (err) {
            console.error("[BGTask] Notification dispatch failed:", err);
          }

          // Sync message into Fable thread store so UI is current on next open.
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

        // ── 7. Synchronous MMKV Write-Back ───────────────────────────────────
        notificationStorage.set(
          "notified_message_ids",
          JSON.stringify(Array.from(notifiedSet).slice(-1000)),
        );

        return hasNewData
          ? BackgroundFetch.BackgroundFetchResult.NewData
          : BackgroundFetch.BackgroundFetchResult.NoData;
      } catch (error) {
        console.error("[BGTask] Headless SMS fetch crashed:", error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });
  } catch {}
}

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Register the background fetch task with the OS scheduler.
 *
 * Safe to call multiple times — idempotent via isRegistered check.
 * Must be called early in app lifecycle (ideally in _layout.tsx useEffect).
 *
 * On iOS:
 * - `stopOnTerminate: false` → survives app kill (requires BGTaskSchedulerPermittedIdentifiers)
 * - `startOnBoot: true`     → survives device reboot
 * - iOS will throttle actual execution to ~15min minimum regardless of minimumInterval
 */
export async function registerBackgroundSMSFetchAsync(): Promise<void> {
  if (isExpoGo) return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_SMS_FETCH_TASK,
    );
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_SMS_FETCH_TASK, {
        minimumInterval: MINIMUM_FETCH_INTERVAL_SECONDS,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }

    // Hint to iOS to execute as often as possible within its adaptive budget.
    // This updates the system's understanding of the app's preferred fetch cadence.
    await BackgroundFetch.setMinimumIntervalAsync(
      MINIMUM_FETCH_INTERVAL_SECONDS,
    );
  } catch {
    // Suppress — background fetch not available in all environments.
  }
}

/**
 * Unregister background fetch task cleanly (e.g. when user logs out).
 */
export async function unregisterBackgroundSMSFetchAsync(): Promise<void> {
  if (isExpoGo) return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_SMS_FETCH_TASK,
    );
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SMS_FETCH_TASK);
    }
  } catch (err) {
    console.warn("[BGTask] Failed to unregister background fetch:", err);
  }
}

// ─── AppState Lifecycle Re-registration ──────────────────────────────────────

let _appStateSubscription: ReturnType<typeof AppState.addEventListener> | null =
  null;

/**
 * Attach an AppState listener that re-verifies task registration whenever the
 * app transitions from foreground → background.
 *
 * iOS can occasionally deregister tasks after certain lifecycle events
 * (e.g. force-quit, OS memory pressure). This ensures the task survives.
 *
 * Returns a cleanup function — call it in the layout's useEffect return.
 */
export function attachBackgroundTaskLifecycleListener(): () => void {
  if (isExpoGo) return () => {};

  let previousState: AppStateStatus = AppState.currentState;

  _appStateSubscription = AppState.addEventListener(
    "change",
    (nextState: AppStateStatus) => {
      // Re-register when transitioning from active/inactive → background
      if (
        (previousState === "active" || previousState === "inactive") &&
        nextState === "background"
      ) {
        void registerBackgroundSMSFetchAsync();
      }
      previousState = nextState;
    },
  );

  return () => {
    _appStateSubscription?.remove();
    _appStateSubscription = null;
  };
}
