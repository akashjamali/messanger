import * as Network from "expo-network";
import { createMMKV } from "react-native-mmkv";
import { create } from "zustand";

import { registerPerson } from "../cookbooks/fable/data/people";
import { useFable } from "../cookbooks/fable/data/store";
import {
  findContactByNumber,
  getCorePhoneDigits,
  loadDeviceContacts,
  parseSMSTimestamp,
  parseSMSTimestampMillis,
} from "../services/contact-matcher";
import { RouterAPI } from "../services/router-api";
import { triggerSMSNotification } from "../services/notification-service";
import { chatCache } from "../services/chat-cache-service";
import { generateNormalizedChatId } from "../utils/phone";
import type {
  RouterChatState,
  RouterDeviceInfo,
  SMSMessage,
} from "../types/router-chat";

const authStorage = createMMKV({ id: "router-auth-v1" });
const notificationStorage = createMMKV({ id: "router-notifications-v1" });

function getStoredNotifiedIds(): Set<string> {
  try {
    const raw = notificationStorage.getString("notified_message_ids");
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.map(String));
      }
    }
  } catch (err) {
    console.error("Failed to read notified message IDs:", err);
  }
  return new Set<string>();
}

function persistNotifiedIds(ids: Set<string>): void {
  try {
    const arr = Array.from(ids).slice(-1000);
    notificationStorage.set("notified_message_ids", JSON.stringify(arr));
  } catch (err) {
    console.error("Failed to persist notified message IDs:", err);
  }
}

let pollingTimer: ReturnType<typeof setInterval> | null = null;
let isPollInFlight = false;

const initialCachedMessages = chatCache.getCachedMessages();
const initialCachedDeviceInfo = chatCache.getCachedDeviceInfo();
const initialRouterIP = authStorage.getString("router_ip") || null;

if (initialCachedMessages.length > 0) {
  chatCache.reconcileFableThreads(initialCachedMessages);
}

export const useRouterChatStore = create<RouterChatState>((set, get) => ({
  isConnectedToRouter: false,
  routerIP: initialRouterIP,
  networkName: null,
  isSMSSupported: true,
  isAuthenticated: false,
  deviceInfo: initialCachedDeviceInfo,
  messages: initialCachedMessages,
  pendingMessages: {},
  isPolling: false,
  lastSyncTime: initialCachedMessages.length > 0 ? Date.now() : null,
  error: null,
  notifiedMessageIds: getStoredNotifiedIds(),
  setActiveChatId: (chatId: string | null) => {
    if (get().activeChatId === chatId) return;
    set({ activeChatId: chatId });
  },

  checkNetworkAndRouter: async () => {
    try {
      const netState = await Network.getNetworkStateAsync();
      const ip = await Network.getIpAddressAsync();
      const isWifi = netState.type === Network.NetworkStateType.WIFI;

      let netName = "Local Network";
      if (isWifi) {
        netName = "Jazz 4G Device";
      }

      // Resolve router gateway IP
      const resolvedIP = await RouterAPI.resolveRouterIP();
      const isRouterAlive = Boolean(resolvedIP);

      if (isRouterAlive && resolvedIP) {
        RouterAPI.setRouterIP(resolvedIP);
        authStorage.set("router_ip", resolvedIP);

        // Probe SMS support
        const smsSupported = await RouterAPI.checkSMSSupport(resolvedIP);

        // Check if existing session is already active on router
        const session = await RouterAPI.checkSession(resolvedIP);
        const sData = session.data || {};

        let signalBar: number | undefined;
        if (sData.signalbar !== undefined && sData.signalbar !== "") {
          const parsed = parseInt(String(sData.signalbar), 10);
          if (!isNaN(parsed)) signalBar = parsed;
        }

        let batteryPercent: number | undefined;
        const rawBatt =
          sData.battery_pers ??
          sData.battery_vol_percent ??
          sData.battery_value;
        if (rawBatt !== undefined && rawBatt !== null && rawBatt !== "") {
          const cleaned = String(rawBatt).replace("%", "").trim();
          const parsed = parseInt(cleaned, 10);
          if (!isNaN(parsed)) {
            if (parsed > 5) {
              batteryPercent = Math.min(100, Math.max(0, parsed));
            } else if (parsed > 0) {
              batteryPercent = parsed * 20;
            } else {
              batteryPercent = 0;
            }
          }
        }

        const isBatteryCharging =
          sData.battery_charging === "1" ||
          sData.charge_status === "1" ||
          sData.battery_charging === "charging";

        const isDataConnected =
          sData.ppp_status === "ppp_connected" ||
          sData.flux_state === "1" ||
          (sData.modem_main_state &&
            sData.modem_main_state !== "modem_sim_undetected");

        const deviceInfo: RouterDeviceInfo = {
          ip: resolvedIP,
          name: netName,
          signalBar,
          batteryPercent,
          isBatteryCharging,
          isDataConnected,
          networkType: sData.network_type,
          pppStatus: sData.ppp_status,
          simStatus: sData.modem_main_state,
          unreadCount: sData.sms_unread_num
            ? Number(sData.sms_unread_num)
            : 0,
        };

        set({
          isConnectedToRouter: true,
          routerIP: resolvedIP,
          networkName: netName,
          isSMSSupported: smsSupported,
          isAuthenticated: session.isLoggedIn,
          deviceInfo,
          error: null,
        });

        // Trigger silent auto-connect if saved credentials exist
        if (!session.isLoggedIn) {
          await get().autoConnect();
        } else {
          get().startPolling();
        }
      } else {
        set({
          isConnectedToRouter: false,
          routerIP: null,
          networkName: ip ? "Connected" : "Disconnected",
          isAuthenticated: false,
        });
        get().stopPolling();
      }
    } catch (err: any) {
      set({
        isConnectedToRouter: false,
        error: err.message || "Network check failed",
      });
      get().stopPolling();
    }
  },

  connectToRouter: async (user: string, pass: string) => {
    try {
      const ip = get().routerIP || RouterAPI.getRouterIP();
      const res = await RouterAPI.login(user, pass, ip);

      if (res.success) {
        // Cache credentials securely in MMKV
        authStorage.set("credentials", JSON.stringify({ user, pass }));
        authStorage.set("router_ip", ip);

        set({
          isAuthenticated: true,
          error: null,
        });

        // Immediately fetch SMS and start fast polling
        get().startPolling();
        const smsList = await RouterAPI.fetchSMS(ip);
        if (smsList.length > 0) {
          get().addMessages(smsList);
        }
      } else {
        set({
          isAuthenticated: false,
          error: res.error || "Authentication failed. Invalid password.",
        });
        throw new Error(res.error || "Authentication failed.");
      }
    } catch (err: any) {
      set({
        isAuthenticated: false,
        error: err.message || "Failed to authenticate with router.",
      });
      throw err;
    }
  },

  autoConnect: async () => {
    try {
      const savedRaw = authStorage.getString("credentials");
      if (!savedRaw) return;

      const creds = JSON.parse(savedRaw);
      if (!creds?.user || !creds?.pass) return;

      const ip = get().routerIP || RouterAPI.getRouterIP();
      const res = await RouterAPI.login(creds.user, creds.pass, ip);

      if (res.success) {
        set({ isAuthenticated: true, error: null });
        get().startPolling();
      }
    } catch {
      // Silent auto-login fail, requires manual login
    }
  },

  disconnectFromRouter: async () => {
    const ip = get().routerIP || RouterAPI.getRouterIP();
    await RouterAPI.logout(ip);
    authStorage.remove("credentials");
    get().stopPolling();
    set({ isAuthenticated: false });
  },

  sendMessage: async (text: string, number: string, threadId?: string) => {
    const trimmed = text.trim();
    if (!trimmed || !number) return;

    // Single source of truth: Universal normalized chatId
    const normalizedChatId = generateNormalizedChatId(threadId || number);
    const now = Date.now();
    const tempId = `sms-out-${now}-${Math.random().toString(36).slice(2, 6)}`;
    const optMsg: SMSMessage = {
      id: tempId,
      chatId: normalizedChatId,
      number,
      content: trimmed,
      date: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      timestamp: now,
      tag: "2",
      status: "sending",
      fromMe: true,
      isMe: true,
    };

    // Optimistic UI: instant 0ms update to both router store and Fable thread
    chatCache.recordSentMessage(number, trimmed, tempId);
    set((state) => {
      const nextMessages = [optMsg, ...state.messages];
      chatCache.saveCachedMessages(nextMessages);
      return {
        messages: nextMessages,
        pendingMessages: { ...state.pendingMessages, [tempId]: optMsg },
      };
    });

    registerPerson({
      id: normalizedChatId,
      name: normalizedChatId,
      first: normalizedChatId,
      phone: number,
    });

    useFable.getState().append(
      normalizedChatId,
      trimmed,
      "me",
      false,
      undefined,
      "sending",
      "now",
      tempId,
      now,
      true,
    );

    // Phase 1: Immediately fire POST request without waiting for polling or network reconnect
    (async () => {
      try {
        let ip = get().routerIP || RouterAPI.getRouterIP();
        if (!get().isAuthenticated) {
          await get().autoConnect();
          ip = get().routerIP || RouterAPI.getRouterIP();
        }

        const result = await RouterAPI.sendSMS(number, trimmed, ip);

        if (result.success) {
          useFable.getState().updateMessageStatus(normalizedChatId, tempId, "sent");
          set((state) => {
            const updated = state.messages.map((m) =>
              m.id === tempId ? { ...m, status: "sent" as const } : m,
            );
            const pending = { ...state.pendingMessages };
            delete pending[tempId];
            return { messages: updated, pendingMessages: pending };
          });
        } else {
          useFable.getState().updateMessageStatus(normalizedChatId, tempId, "failed");
          set((state) => {
            const updated = state.messages.map((m) =>
              m.id === tempId ? { ...m, status: "failed" as const } : m,
            );
            const pending = {
              ...state.pendingMessages,
              [tempId]: { ...optMsg, status: "failed" as const },
            };
            return {
              messages: updated,
              pendingMessages: pending,
              error: result.error || "SMS failed to send.",
            };
          });
        }
      } catch (err: any) {
        useFable.getState().updateMessageStatus(normalizedChatId, tempId, "failed");
        set((state) => {
          const updated = state.messages.map((m) =>
            m.id === tempId ? { ...m, status: "failed" as const } : m,
          );
          const pending = {
            ...state.pendingMessages,
            [tempId]: { ...optMsg, status: "failed" as const },
          };
          return {
            messages: updated,
            pendingMessages: pending,
            error: err.message || "Network error while sending SMS.",
          };
        });
      }
    })();
  },

  retryMessage: async (tempId: string) => {
    const pending = get().pendingMessages[tempId];
    if (!pending) return;

    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === tempId ? { ...m, status: "sending" as const } : m,
      ),
    }));

    const ip = get().routerIP || RouterAPI.getRouterIP();
    const result = await RouterAPI.sendSMS(pending.number, pending.content, ip);

    if (result.success) {
      set((state) => {
        const updated = state.messages.map((m) =>
          m.id === tempId ? { ...m, status: "sent" as const } : m,
        );
        const newPending = { ...state.pendingMessages };
        delete newPending[tempId];
        return { messages: updated, pendingMessages: newPending };
      });
    } else {
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === tempId ? { ...m, status: "failed" as const } : m,
        ),
      }));
    }
  },

  handleIncomingMessages: (
    newMessages: SMSMessage[],
    activeChatId?: string | null,
  ) => {
    const currentActive =
      activeChatId !== undefined ? activeChatId : get().activeChatId;
    const currentNotified = new Set(get().notifiedMessageIds);
    let hasNewNotification = false;

    loadDeviceContacts().then((contacts) => {
      for (const msg of newMessages) {
        // 1. Strict Deduplication: Fire exactly once per message ID
        if (currentNotified.has(msg.id)) {
          continue;
        }

        // Add to notified tracking set
        currentNotified.add(msg.id);
        hasNewNotification = true;

        // 2. Ignore outgoing messages (fromMe or tag === "3")
        if (msg.fromMe || msg.tag === "3") {
          continue;
        }

        // 3. Foreground Check: Don't notify if user is currently inside this chat thread
        const normMsgChatId =
          msg.chatId || generateNormalizedChatId(msg.number);
        const normActive = currentActive
          ? generateNormalizedChatId(currentActive)
          : null;
        if (
          normActive &&
          (normMsgChatId === normActive ||
            msg.number === currentActive ||
            msg.id === currentActive)
        ) {
          continue;
        }

        // 4. Resolve sender name from contacts
        const matched = findContactByNumber(msg.number, contacts);
        const title = matched ? matched.name : msg.number;

        // 5. Fire notification safely with try/catch
        try {
          void triggerSMSNotification({
            id: msg.id,
            senderName: title,
            senderNumber: msg.number,
            content: msg.content,
            chatId: normMsgChatId,
          });
        } catch (error) {
          console.error("Notification crash prevented:", error);
        }
      }

      if (hasNewNotification) {
        persistNotifiedIds(currentNotified);
        set({ notifiedMessageIds: currentNotified });
      }
    });
  },

  addMessages: (newMessages: SMSMessage[]) => {
    // Check if this is the very first time messages are loaded into the store
    const isInitialLoad =
      get().messages.length === 0 && get().lastSyncTime === null;

    if (isInitialLoad) {
      // Seed all existing historical message IDs so we never spam the user on startup/reconnect
      const seeded = new Set(get().notifiedMessageIds);
      for (const m of newMessages) {
        seeded.add(m.id);
      }
      persistNotifiedIds(seeded);
      set({ notifiedMessageIds: seeded });
    } else {
      // Trigger notification handler ONLY for actual incoming messages (not sent, not our own echo)
      const trulyIncoming = newMessages.filter(
        (m) =>
          !m.fromMe &&
          m.tag !== "2" &&
          m.tag !== "3" &&
          !chatCache.isSentMessage(m.number, m.content, m.tag),
      );
      if (trulyIncoming.length > 0) {
        get().handleIncomingMessages(trulyIncoming);
      }
    }

    set((state) => {
      const currentMessages = [...state.messages];
      const existingIds = new Set(currentMessages.map((m) => m.id));

      for (const fetchedMsg of newMessages) {
        const parsedTime =
          fetchedMsg.timestamp ?? parseSMSTimestampMillis(fetchedMsg.date);
        const trimmedContent = fetchedMsg.content.trim();
        const coreNum = getCorePhoneDigits(fetchedMsg.number);

        // 1. ECHO FIX & OPTIMISTIC MERGE:
        // Check if this is a message we already sent optimistically
        const optimisticIndex = currentMessages.findIndex((m) => {
          if (!m.fromMe) return false;
          const sameNum =
            getCorePhoneDigits(m.number) === coreNum ||
            m.number === fetchedMsg.number;
          const sameContent = m.content.trim() === trimmedContent;
          const timeDiff = Math.abs((m.timestamp ?? 0) - parsedTime);
          return sameNum && sameContent && timeDiff < 180000;
        });

        if (optimisticIndex !== -1) {
          // Merge by updating status and recording sent signature
          const opt = currentMessages[optimisticIndex];
          currentMessages[optimisticIndex] = {
            ...opt,
            status: "sent",
          };
          chatCache.recordSentMessage(
            fetchedMsg.number,
            trimmedContent,
            fetchedMsg.id,
          );
          // Discard fetched duplicate copy
          continue;
        }

        // Determine if it is a sent message from the router or our cache
        const isSentByUs =
          fetchedMsg.fromMe ||
          fetchedMsg.tag === "2" ||
          fetchedMsg.tag === "3" ||
          chatCache.isSentMessage(
            fetchedMsg.number,
            trimmedContent,
            fetchedMsg.tag,
          );

        // Check if it is an echo of our own sent message (prevent duplicate incoming bubbles)
        const isEchoOfOurSent = currentMessages.some(
          (m) =>
            m.fromMe &&
            getCorePhoneDigits(m.number) === coreNum &&
            m.content.trim() === trimmedContent &&
            Math.abs((m.timestamp ?? 0) - parsedTime) < 180000,
        );
        if (isEchoOfOurSent) {
          continue; // DISCARD ECHO
        }

        // Standard deduplication by message ID
        if (existingIds.has(fetchedMsg.id)) {
          continue;
        }

        existingIds.add(fetchedMsg.id);
        const normalizedChatId =
          fetchedMsg.chatId || generateNormalizedChatId(fetchedMsg.number);
        currentMessages.push({
          ...fetchedMsg,
          chatId: normalizedChatId,
          fromMe: isSentByUs,
          isMe: isSentByUs,
          timestamp: parsedTime,
        });
      }

      // 2. SORTING FIX: Enforce strict mathematical chronological order (Descending for inbox)
      currentMessages.sort(
        (a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0),
      );

      // Save to persistent MMKV cache
      chatCache.saveCachedMessages(currentMessages);

      return {
        messages: currentMessages,
        lastSyncTime: Date.now(),
      };
    });

    // Synchronize to Fable threads
    loadDeviceContacts().then((contacts) => {
      for (const msg of newMessages) {
        const normalizedChatId =
          msg.chatId || generateNormalizedChatId(msg.number);
        const trimmedContent = msg.content.trim();
        const parsedTime =
          msg.timestamp ?? parseSMSTimestampMillis(msg.date);

        const isSentByUs =
          msg.fromMe ||
          msg.isMe === true ||
          msg.tag === "2" ||
          msg.tag === "3" ||
          chatCache.isSentMessage(msg.number, trimmedContent, msg.tag) ||
          chatCache.isSentId(msg.id);

        const currentThreadMsgs =
          useFable.getState().threads[normalizedChatId] || [];
        const isEcho =
          !isSentByUs &&
          currentThreadMsgs.some(
            (m) =>
              (m.from === "me" || m.isMe === true) &&
              m.text.trim() === trimmedContent &&
              Math.abs((m.timestamp ?? 0) - parsedTime) < 180000,
          );

        // DISCARD ECHO: Never add our own sent text as an incoming bubble!
        if (isEcho) {
          continue;
        }

        const matched = findContactByNumber(msg.number, contacts);
        const displayName = matched ? matched.name : msg.number;
        const displayFirst = matched ? matched.first : msg.number;

        registerPerson({
          id: normalizedChatId,
          name: displayName,
          first: displayFirst,
          avatar: matched?.avatar,
          phone: msg.number,
        });

        const exactTime = parseSMSTimestamp(msg.date);

        useFable.getState().append(
          normalizedChatId,
          msg.content,
          isSentByUs ? "me" : "them",
          false,
          undefined,
          "sent",
          exactTime,
          msg.id,
          parsedTime,
          isSentByUs,
        );
      }

      // Purge any preexisting echoes from Fable threads
      chatCache.reconcileFableThreads(newMessages);
    });
  },

  markChatAsRead: (chatId: string) => {
    useFable.getState().markRead(chatId);
    set((state) => ({
      messages: state.messages.map((m) =>
        m.number === chatId ? { ...m, tag: "1" } : m,
      ),
    }));

    const ip = get().routerIP || RouterAPI.getRouterIP();
    if (get().isConnectedToRouter && get().isAuthenticated) {
      const unreadIds = get()
        .messages.filter((m) => m.number === chatId && !m.fromMe)
        .map((m) => m.id);
      if (unreadIds.length > 0) {
        RouterAPI.markRead(unreadIds, ip).catch(() => {});
      }
    }
  },

  startPolling: () => {
    if (pollingTimer) return;
    set({ isPolling: true });

    const poll = async () => {
      if (isPollInFlight || !get().isConnectedToRouter || !get().isAuthenticated) {
        return;
      }
      isPollInFlight = true;

      try {
        const ip = get().routerIP || RouterAPI.getRouterIP();
        const incoming = await RouterAPI.fetchSMS(ip);

        if (incoming.length > 0) {
          get().addMessages(incoming);
        }

        // Live metrics refresh every ~5 seconds (every 4 poll iterations)
        if (Math.random() < 0.25) {
          void RouterAPI.checkSession(ip).then((session) => {
            if (session.ok && session.data) {
              const sData = session.data;
              let signalBar: number | undefined;
              if (sData.signalbar !== undefined && sData.signalbar !== "") {
                const parsed = parseInt(String(sData.signalbar), 10);
                if (!isNaN(parsed)) signalBar = parsed;
              }

              let batteryPercent: number | undefined;
              const rawBatt =
                sData.battery_pers ??
                sData.battery_vol_percent ??
                sData.battery_value;
              if (rawBatt !== undefined && rawBatt !== null && rawBatt !== "") {
                const cleaned = String(rawBatt).replace("%", "").trim();
                const parsed = parseInt(cleaned, 10);
                if (!isNaN(parsed)) {
                  if (parsed > 5) {
                    batteryPercent = Math.min(100, Math.max(0, parsed));
                  } else if (parsed > 0) {
                    batteryPercent = parsed * 20;
                  } else {
                    batteryPercent = 0;
                  }
                }
              }

              const isBatteryCharging =
                sData.battery_charging === "1" ||
                sData.charge_status === "1" ||
                sData.battery_charging === "charging";

              const isDataConnected =
                sData.ppp_status === "ppp_connected" ||
                sData.flux_state === "1" ||
                (sData.modem_main_state &&
                  sData.modem_main_state !== "modem_sim_undetected");

              set((state) => ({
                deviceInfo: state.deviceInfo
                  ? {
                      ...state.deviceInfo,
                      signalBar:
                        signalBar !== undefined
                          ? signalBar
                          : state.deviceInfo.signalBar,
                      batteryPercent:
                        batteryPercent !== undefined
                          ? batteryPercent
                          : state.deviceInfo.batteryPercent,
                      isBatteryCharging,
                      isDataConnected,
                      networkType:
                        sData.network_type || state.deviceInfo.networkType,
                      pppStatus: sData.ppp_status || state.deviceInfo.pppStatus,
                    }
                  : null,
              }));
            }
          });
        }
      } catch {
        // Suppress poll error to keep sync running smoothly
      } finally {
        isPollInFlight = false;
      }
    };

    // Initial fetch
    poll();
    // Millisecond aggressive synchronization interval
    pollingTimer = setInterval(poll, 1200);
  },

  stopPolling: () => {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
    set({ isPolling: false });
  },

  deleteThreads: async (chatIds: string[]) => {
    if (!chatIds.length) return;
    const currentMessages = get().messages;
    const normalizedTargetIds = new Set(chatIds.map(generateNormalizedChatId));
    const rawTargetIds = new Set(chatIds);
    const idsToDelete: string[] = [];

    for (const msg of currentMessages) {
      const msgNormId =
        msg.chatId || generateNormalizedChatId(msg.number);
      if (
        rawTargetIds.has(msg.number) ||
        normalizedTargetIds.has(msgNormId)
      ) {
        if (
          msg.id &&
          !msg.id.startsWith("local-") &&
          !msg.id.startsWith("sms-out-")
        ) {
          idsToDelete.push(msg.id);
        }
      }
    }

    if (
      get().isConnectedToRouter &&
      get().isAuthenticated &&
      idsToDelete.length > 0
    ) {
      try {
        const ip = get().routerIP || RouterAPI.getRouterIP();
        await RouterAPI.deleteSMS(idsToDelete, ip);
      } catch (err) {
        console.warn("Hardware SIM SMS deletion failed:", err);
      }
    }

    // Remove SMS messages from router store
    set((state) => ({
      messages: state.messages.filter((m) => {
        const norm = m.chatId || generateNormalizedChatId(m.number);
        return !rawTargetIds.has(m.number) && !normalizedTargetIds.has(norm);
      }),
    }));

    // Remove chat threads from Fable local state
    useFable
      .getState()
      .removeThreads([
        ...Array.from(normalizedTargetIds),
        ...Array.from(rawTargetIds),
      ]);
  },
}));
