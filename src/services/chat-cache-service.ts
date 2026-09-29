import { createMMKV } from "react-native-mmkv";
import type { RouterDeviceInfo, SMSMessage } from "../types/router-chat";
import type { Person } from "../cookbooks/fable/data/people";
import { getCorePhoneDigits } from "./contact-matcher";
import { useFable } from "../cookbooks/fable/data/store";
import { generateNormalizedChatId } from "../utils/phone";

const cacheStorage = createMMKV({ id: "router-chat-cache-v1" });

const KEYS = {
  MESSAGES: "cached_sms_messages",
  SENT_SIGNATURES: "cached_sent_signatures",
  SENT_IDS: "cached_sent_ids",
  DEVICE_INFO: "cached_device_info",
  CONTACTS: "cached_device_contacts",
  LAST_SYNC: "cached_last_sync_timestamp",
};

class ChatCacheService {
  private sentSignatures: Set<string>;
  private sentIds: Set<string>;

  constructor() {
    this.sentSignatures = this.loadSet(KEYS.SENT_SIGNATURES);
    this.sentIds = this.loadSet(KEYS.SENT_IDS);
  }

  private loadSet(key: string): Set<string> {
    try {
      const raw = cacheStorage.getString(key);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          return new Set(arr.map(String));
        }
      }
    } catch (err) {
      console.warn(`[ChatCacheService] Failed to load set for ${key}:`, err);
    }
    return new Set<string>();
  }

  private persistSet(key: string, set: Set<string>, limit = 2000): void {
    try {
      const arr = Array.from(set).slice(-limit);
      cacheStorage.set(key, JSON.stringify(arr));
    } catch (err) {
      console.warn(`[ChatCacheService] Failed to persist set for ${key}:`, err);
    }
  }

  /**
   * Retrieves all cached SMS messages from local MMKV storage
   */
  public getCachedMessages(): SMSMessage[] {
    try {
      const raw = cacheStorage.getString(KEYS.MESSAGES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map((m: any) => ({
            ...m,
            fromMe: this.isSentMessage(m.number, m.content, m.tag) || Boolean(m.fromMe),
          }));
        }
      }
    } catch (err) {
      console.warn("[ChatCacheService] Failed to read cached messages:", err);
    }
    return [];
  }

  /**
   * Persists SMS messages to local MMKV storage (capped to recent 2000 for efficiency)
   */
  public saveCachedMessages(messages: SMSMessage[]): void {
    try {
      const capped = messages.slice(0, 2000);
      cacheStorage.set(KEYS.MESSAGES, JSON.stringify(capped));
      cacheStorage.set(KEYS.LAST_SYNC, String(Date.now()));
    } catch (err) {
      console.warn("[ChatCacheService] Failed to save cached messages:", err);
    }
  }

  /**
   * Records a sent message signature so it is permanently identified as 'fromMe: true'
   */
  public recordSentMessage(number: string, text: string, messageId?: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;

    const core = getCorePhoneDigits(number);
    const cleanNum = number.replace(/\D/g, "");

    if (cleanNum) {
      this.sentSignatures.add(`${cleanNum}:${trimmed}`);
    }
    if (core) {
      this.sentSignatures.add(`${core}:${trimmed}`);
    }
    this.sentSignatures.add(trimmed);

    if (messageId) {
      this.sentIds.add(messageId);
    }

    this.persistSet(KEYS.SENT_SIGNATURES, this.sentSignatures);
    this.persistSet(KEYS.SENT_IDS, this.sentIds);
  }

  /**
   * Determines if a message was sent by the user based on:
   * 1. ZTE/Jazz status tags ('2' = Sent, '3' = Failed Sent / Outbox)
   * 2. Stored sent IDs or signature matching (core digits + body text)
   */
  public isSentMessage(number?: string, text?: string, tag?: string): boolean {
    const strTag = String(tag ?? "").trim();
    // ZTE / 3GPP SMS Outbox tags:
    // Tag 2 = Stored Sent SMS
    // Tag 3 = Failed / Pending Outbox SMS
    if (strTag === "2" || strTag === "3") {
      return true;
    }

    if (!text) return false;
    const trimmed = text.trim();

    if (this.sentSignatures.has(trimmed)) {
      return true;
    }

    if (number) {
      const cleanNum = number.replace(/\D/g, "");
      const core = getCorePhoneDigits(number);
      if (cleanNum && this.sentSignatures.has(`${cleanNum}:${trimmed}`)) {
        return true;
      }
      if (core && this.sentSignatures.has(`${core}:${trimmed}`)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if an ID belongs to a known sent message
   */
  public isSentId(id: string): boolean {
    return this.sentIds.has(id);
  }

  /**
   * Retrieves cached router device info (signal, battery, IP, ppp)
   */
  public getCachedDeviceInfo(): RouterDeviceInfo | null {
    try {
      const raw = cacheStorage.getString(KEYS.DEVICE_INFO);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}
    return null;
  }

  /**
   * Saves router device info to cache
   */
  public saveCachedDeviceInfo(info: RouterDeviceInfo): void {
    try {
      cacheStorage.set(KEYS.DEVICE_INFO, JSON.stringify(info));
    } catch {}
  }

  /**
   * Retrieves cached contacts
   */
  public getCachedContacts(): Person[] {
    try {
      const raw = cacheStorage.getString(KEYS.CONTACTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }

  /**
   * Saves contacts to cache
   */
  public saveCachedContacts(contacts: Person[]): void {
    try {
      cacheStorage.set(KEYS.CONTACTS, JSON.stringify(contacts));
    } catch {}
  }

  /**
   * Heals past messages in Fable store:
   * Scans threads and flips any messages that were wrongly placed on receiver's side
   * ('them') to the sender's side ('me') if they are sent messages.
   */
  public reconcileFableThreads(messages?: SMSMessage[]): void {
    try {
      const fableState = useFable.getState();
      const threads = fableState.threads;
      if (!threads) return;

      let hasChanges = false;

      // Populate sent signatures from provided router messages
      if (messages && messages.length > 0) {
        for (const m of messages) {
          if (m.fromMe || m.tag === "2" || m.tag === "3") {
            this.recordSentMessage(m.number, m.content, m.id);
          }
        }
      }

      // 1. Thread Consolidation: Group all thread messages by normalized chatId
      const consolidated: Record<string, any[]> = {};
      for (const [rawId, rawMsgs] of Object.entries(threads)) {
        if (!Array.isArray(rawMsgs)) continue;
        const normId = generateNormalizedChatId(rawId);
        if (!consolidated[normId]) {
          consolidated[normId] = [];
        }
        consolidated[normId].push(...rawMsgs);
        if (normId !== rawId) {
          hasChanges = true;
        }
      }

      const updatedThreads: Record<string, any[]> = {};

      // 2. Reconcile each consolidated thread
      for (const [threadId, threadMessages] of Object.entries(consolidated)) {
        // Deduplicate messages by id or content+timestamp
        const seenIds = new Set<string>();
        const uniqueMsgs: any[] = [];
        for (const msg of threadMessages) {
          if (!msg) continue;
          const key = msg.id || `${msg.text}:${msg.timestamp}`;
          if (!seenIds.has(key)) {
            seenIds.add(key);
            uniqueMsgs.push(msg);
          }
        }

        const nextMsgs = uniqueMsgs.map((msg) => {
          const trimmed = (msg.text || "").trim();
          const shouldBeMe =
            msg.from === "me" ||
            msg.isMe === true ||
            this.isSentMessage(threadId, trimmed, (msg as any).tag) ||
            this.isSentId(msg.id);

          if (shouldBeMe) {
            if (msg.from !== "me" || !msg.isMe) {
              hasChanges = true;
            }
            return {
              ...msg,
              from: "me" as const,
              isMe: true,
              status: msg.status || "sent",
            };
          }
          return {
            ...msg,
            from: "them" as const,
            isMe: false,
          };
        });

        nextMsgs.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
        updatedThreads[threadId] = nextMsgs;
      }

      // Check if thread keys changed
      const oldKeys = Object.keys(threads);
      const newKeys = Object.keys(updatedThreads);
      if (oldKeys.length !== newKeys.length || oldKeys.some((k) => !updatedThreads[k])) {
        hasChanges = true;
      }

      if (hasChanges) {
        useFable.setState({ threads: updatedThreads });
      }
    } catch (err) {
      console.warn("[ChatCacheService] reconcileFableThreads error:", err);
    }
  }

  /**
   * Clears the cache
   */
  public clearCache(): void {
    cacheStorage.clearAll();
    this.sentSignatures.clear();
    this.sentIds.clear();
  }
}

export const chatCache = new ChatCacheService();
