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

          // Check if message already exists by ID or content/timestamp
          const existingIdx = currentList.findIndex(
            (m) =>
              (messageId && m.id === messageId) ||
              (m.text === trimmed &&
                (m.id === resolvedId ||
                  (m.timestamp && Math.abs(m.timestamp - resolvedTime) < 120000))),
          );

          if (existingIdx !== -1) {
            const existing = currentList[existingIdx];
            // If message was wrongly recorded as 'them' but incoming is 'me', correct direction
            if (existing && resolvedIsMe && existing.from !== "me") {
              const updatedList = [...currentList];
              updatedList[existingIdx] = {
                ...existing,
                from: "me",
                isMe: true,
                status: status || existing.status || "sent",
              };
              return {
                threads: {
                  ...state.threads,
                  [id]: updatedList,
                },
              };
            }
            return state;
          }

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
