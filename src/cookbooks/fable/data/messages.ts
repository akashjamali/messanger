export type Message = {
  id: string;
  from: "me" | "them";
  isMe?: boolean;
  text: string;
  at: string;
  timestamp?: number;
  photo?: boolean;
  imageUri?: string;
  status?: "sending" | "sent" | "failed";
};

export function messagesFor(_personId: string, _first?: string): Message[] {
  return [];
}

