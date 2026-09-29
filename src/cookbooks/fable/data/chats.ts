export type Chat = {
  id: string;
  personId: string;
  preview: string;
  time: string;
  unread: number;
  fromMe?: boolean;
};

export const CHATS: Chat[] = [];
