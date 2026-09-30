export type SMSMessage = {
  id: string;
  chatId: string;
  number: string;
  content: string;
  date: string;
  timestamp?: number;
  tag: string; // "1" = read, "2" = unread, "3" = sent
  status?: "sending" | "sent" | "failed";
  fromMe: boolean;
  isMe?: boolean;
};

export type RouterDeviceInfo = {
  ip: string;
  name: string;
  signalBar?: number;
  batteryPercent?: number;
  isBatteryCharging?: boolean;
  isDataConnected?: boolean;
  networkType?: string;
  operator?: string;
  pppStatus?: string;
  unreadCount?: number;
  simStatus?: string;
};

export interface RouterChatState {
  isConnectedToRouter: boolean;
  routerIP: string | null;
  networkName: string | null;
  isSMSSupported: boolean;
  isAuthenticated: boolean;
  deviceInfo: RouterDeviceInfo | null;
  messages: SMSMessage[];
  pendingMessages: Record<string, SMSMessage>;
  isPolling: boolean;
  lastSyncTime: number | null;
  error: string | null;
  connectToRouter: (user: string, pass: string) => Promise<void>;
  autoConnect: () => Promise<void>;
  disconnectFromRouter: () => Promise<void>;
  sendMessage: (
    text: string,
    number: string,
    threadId?: string,
  ) => Promise<void>;
  retryMessage: (tempId: string) => Promise<void>;
  addMessages: (newMessages: SMSMessage[]) => void;
  markChatAsRead: (chatId: string) => void;
  startPolling: () => void;
  stopPolling: () => void;
  checkNetworkAndRouter: () => Promise<void>;
  notifiedMessageIds: Set<string>;
  activeChatId: string | null;
  setActiveChatId: (chatId: string | null) => void;
  handleIncomingMessages: (
    messages: SMSMessage[],
    activeChatId?: string | null,
  ) => void;
  deleteThreads: (chatIds: string[]) => Promise<void>;
  updateOrAddMessages: (
    fetchedMessages: SMSMessage[],
    currentChatId?: string,
  ) => void;
}
