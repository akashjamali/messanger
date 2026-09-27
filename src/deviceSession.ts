import { File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "mifi.device.session";
const SEEN_NAME = "mifi-seen-ids.json";

export type DeviceSession = {
  ip: string;
  ssid: string;
  username: string;
  password: string;
};

function chatFile() {
  return new File(Paths.document, "mifi-chats.json");
}

export async function loadSession(): Promise<DeviceSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as DeviceSession;
    if (!data?.ip || !data?.password) return null;
    return {
      ip: data.ip,
      ssid: data.ssid || "",
      username: data.username || "",
      password: data.password,
    };
  } catch {
    return null;
  }
}

export async function saveSession(session: DeviceSession): Promise<void> {
  try {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  } catch {
    // The phone could not store the sign-in.
  }
}

export async function clearSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    // Already gone.
  }
}

export async function loadChatCache<T>(): Promise<T[]> {
  try {
    const file = chatFile();
    if (!file.exists) return [];
    const data = JSON.parse(file.textSync());
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function loadSeenIds(): Promise<string[] | null> {
  try {
    const file = new File(Paths.document, SEEN_NAME);
    if (!file.exists) return null;
    const data = JSON.parse(file.textSync());
    return Array.isArray(data) ? data.filter((id) => typeof id === "string") : [];
  } catch {
    return null;
  }
}

export async function saveSeenIds(ids: string[]): Promise<void> {
  try {
    const file = new File(Paths.document, SEEN_NAME);
    if (!file.exists) file.create();
    file.write(JSON.stringify(ids));
  } catch {
    // The phone could not store the seen list.
  }
}

export async function saveChatCache(chats: unknown): Promise<void> {
  try {
    const file = chatFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify(chats));
  } catch {
    // Cache write can fail if the phone is out of space.
  }
}
