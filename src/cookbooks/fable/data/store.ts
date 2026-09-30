import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createMMKV } from "react-native-mmkv";
import { messagesFor, type Message } from "./messages";
import { PEOPLE_BY_ID } from "./people";

const storage = createMMKV({ id: "fable-local-v1" });
let sequence = 0;
type State = {
  threads: Record<string, Message[]>;
  read: string[];
  theme: "system" | "light" | "dark";
  append: (
    id: string,
    text: string,
    from?: Message["from"],
    photo?: boolean,
    imageUri?: string,
    status?: Message["status"],
    at?: string,
    messageId?: string,
    timestamp?: number,
    isMe?: boolean,
  ) => void;
  updateMessageStatus: (
    personId: string,
    messageId: string,
    status: Message["status"],
  ) => void;
  removeThread: (id: string) => void;
  removeThreads: (ids: string[]) => void;
  markRead: (id: string) => void;
  setTheme: (theme: State["theme"]) => void;
  reset: () => void;
};
export const useFable = create<State>()(
  persist(
    (set, get) => ({
      threads: {},
      read: [],
      theme: "light",
      append: (
        id,
        text,
        from = "me",
        photo = false,
        imageUri?: string,
        status?: Message["status"],
        at?: string,
        messageId?: string,
        timestamp?: number,
        isMe?: boolean,
      ) => {
        const person = PEOPLE_BY_ID[id];
        if (!person || (!photo && !imageUri && !text.trim())) return;
        set((state) => {
          const currentList =
            state.threads[id] ?? messagesFor(id, person.first);
          const resolvedId = messageId || `local-${Date.now()}-${++sequence}`;
          const trimmed = text.trim();
          const resolvedTime = timestamp || Date.now();
          const resolvedIsMe = isMe !== undefined ? isMe : from === "me";
          const resolvedFrom: Message["from"] = resolvedIsMe ? "me" : from;

          // 1. Primary Check: Does the exact ID already exist in this thread?
          const existingIdxById = messageId
            ? currentList.findIndex((m) => m.id === messageId)
            : -1;

          if (existingIdxById > -1) {
            const updatedList = [...currentList];
            updatedList[existingIdxById] = {
              ...updatedList[existingIdxById],
              status: status || updatedList[existingIdxById].status || "sent",
              from: resolvedFrom,
              isMe: resolvedIsMe,
              at: at || updatedList[existingIdxById].at,
            };
            return {
              threads: {
                ...state.threads,
                [id]: updatedList,
              },
            };
          }

          // 2. Secondary Check (Content-Based Deduplication for Sent Messages):
          // Match criteria: sent message, exact trimmed text, within 60-second window or temporary ID
          if (resolvedIsMe) {
            const existingOptimisticIndex = currentList.findIndex((m) => {
              const isSent = m.isMe || m.from === "me";
              if (!isSent) return false;
              if (m.text.trim() !== trimmed) return false;
              const isTempId =
                m.id.startsWith("sms-out-") ||
                m.id.startsWith("local-");
              const timeDiff = Math.abs((m.timestamp ?? 0) - resolvedTime);
              return isTempId || timeDiff < 60000;
            });

            if (existingOptimisticIndex > -1) {
              // Found the optimistic echo! Reconcile permanent router ID and timestamp
              const updatedList = [...currentList];
              updatedList[existingOptimisticIndex] = {
                ...updatedList[existingOptimisticIndex],
                id: messageId || updatedList[existingOptimisticIndex].id,
                timestamp: resolvedTime,
                at: at || updatedList[existingOptimisticIndex].at,
                status: status || "sent",
                from: "me",
                isMe: true,
              };
              updatedList.sort(
                (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
              );
              return {
                threads: {
                  ...state.threads,
                  [id]: updatedList,
                },
              };
            }
          }

          // 3. Secondary Check for incoming ('them') messages:
          if (!resolvedIsMe) {
            const existingThemIndex = currentList.findIndex(
              (m) =>
                (!m.isMe && m.from === "them") &&
                m.text.trim() === trimmed &&
                Math.abs((m.timestamp ?? 0) - resolvedTime) < 60000,
            );
            if (existingThemIndex > -1) {
              const updatedList = [...currentList];
              updatedList[existingThemIndex] = {
                ...updatedList[existingThemIndex],
                id: messageId || updatedList[existingThemIndex].id,
                timestamp: resolvedTime,
                at: at || updatedList[existingThemIndex].at,
              };
              return {
                threads: {
                  ...state.threads,
                  [id]: updatedList,
                },
              };
            }
          }

          // 4. Truly new message: Add it
          const newMsg: Message = {
            id: resolvedId,
            from: resolvedFrom,
            isMe: resolvedIsMe,
            text: trimmed,
            at: at || "now",
            timestamp: resolvedTime,
            photo: photo || !!imageUri,
            imageUri,
            status,
          };

          const nextList = [...currentList, newMsg];
          nextList.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

          return {
            threads: {
              ...state.threads,
              [id]: nextList,
            },
            read:
              from === "them"
                ? state.read.filter((r) => r !== id)
                : state.read,
          };
        });
      },
      removeThread: (id) => {
        set((state) => {
          const next = { ...state.threads };
          delete next[id];
          return {
            threads: next,
            read: state.read.filter((r) => r !== id),
          };
        });
      },
      removeThreads: (ids) => {
        const setIds = new Set(ids);
        set((state) => {
          const next = { ...state.threads };
          for (const id of ids) {
            delete next[id];
          }
          return {
            threads: next,
            read: state.read.filter((r) => !setIds.has(r)),
          };
        });
      },
      updateMessageStatus: (personId, messageId, status) => {
        set((state) => {
          const current = state.threads[personId];
          if (!current) return state;
          return {
            threads: {
              ...state.threads,
              [personId]: current.map((m) =>
                m.id === messageId ? { ...m, status } : m,
              ),
            },
          };
        });
      },
      markRead: (id) => {
        if (!get().read.includes(id))
          set((state) => ({ read: [...state.read, id] }));
      },
      setTheme: (theme) => set({ theme }),
      reset: () => set({ threads: {}, read: [] }),
    }),
    {
      name: "fable-state",
      storage: createJSONStorage(() => ({
        getItem: (key) => {
          const raw = storage.getString(key);
          if (!raw) return null;
          try {
            const parsed = JSON.parse(raw);
            if (
              parsed?.state &&
              (!parsed.state.theme || parsed.state.theme === "system")
            ) {
              parsed.state.theme = "light";
              return JSON.stringify(parsed);
            }
          } catch {
            return raw;
          }
          return raw;
        },
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.remove(key),
      })),
    },
  ),
);
