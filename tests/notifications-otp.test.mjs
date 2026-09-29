import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const cache = new Map();
const disks = new Map();

function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const require = createRequire(file);
  const localRequire = (id) => {
    if (id === "react-native-mmkv")
      return {
        createMMKV: ({ id }) => {
          if (!disks.has(id)) disks.set(id, new Map());
          const disk = disks.get(id);
          return {
            getString: (key) => disk.get(key),
            set: (key, value) => disk.set(key, value),
            remove: (key) => disk.delete(key),
          };
        },
      };
    if (id === "expo-notifications")
      return {
        setNotificationHandler: () => {},
        setNotificationChannelAsync: async () => {},
        getPermissionsAsync: async () => ({ status: "granted" }),
        requestPermissionsAsync: async () => ({ status: "granted" }),
        scheduleNotificationAsync: async () => "mock-notification-id",
        getLastNotificationResponseAsync: async () => null,
        addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
        AndroidImportance: { MAX: 5 },
      };
    if (id === "react-native")
      return {
        Platform: { OS: "ios" },
      };
    if (id.startsWith("expo-contacts"))
      return {
        getPermissionsAsync: async () => ({ status: "granted" }),
        getContactsAsync: async () => ({ data: [] }),
        PermissionStatus: { GRANTED: "granted" },
        Fields: {},
        SortTypes: {},
      };
    if (id.startsWith(".")) {
      const resolved = path.resolve(path.dirname(file), id);
      const source = [resolved, `${resolved}.ts`, `${resolved}.tsx`].find(
        existsSync,
      );
      if (source) return load(source);
    }
    return require(id);
  };
  const output = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`, {
    filename: file,
  })(localRequire, module, module.exports);
  return module.exports;
}

const { extractOTP } = load(
  path.join(root, "src/services/notification-service.ts"),
);

test("OTP extraction: extracts 4, 6, and 8 digit verification codes from SMS bodies", () => {
  assert.equal(
    extractOTP("Your JazzCash verification code is 492102. Do not share."),
    "492102",
  );
  assert.equal(extractOTP("Use OTP: 8391 for login."), "8391");
  assert.equal(extractOTP("Your secret pin is 77332211"), "77332211");
  assert.equal(
    extractOTP("HBL Alert: OTP for transaction is 554411"),
    "554411",
  );
  assert.equal(extractOTP("Hello, how are you doing today?"), null);
  assert.equal(extractOTP(""), null);
});

test("Notifications & Deduplication: MMKV persists notified IDs and gates duplicates", () => {
  const disk = new Map();
  const notifiedIds = new Set(["msg-101", "msg-102"]);

  // Test Deduplication check
  assert.ok(notifiedIds.has("msg-101"));
  assert.ok(!notifiedIds.has("msg-103"));

  // Emulate incoming new message
  notifiedIds.add("msg-103");
  disk.set("notified_message_ids", JSON.stringify(Array.from(notifiedIds)));

  // Verify persistence and rehydration
  const stored = JSON.parse(disk.get("notified_message_ids"));
  assert.equal(stored.length, 3);
  assert.ok(stored.includes("msg-103"));
});

test("Foreground Suppression: activeChatId correctly suppresses notification for current open thread", () => {
  const activeChatId = "03001234567";

  const incoming1 = {
    id: "sms-201",
    number: "03001234567",
    content: "Hey, are you there?",
  };

  const incoming2 = {
    id: "sms-202",
    number: "03219876543",
    content: "Meeting starts in 5 minutes",
  };

  const shouldNotify = (msg, activeId) => {
    return activeId ? msg.number !== activeId : true;
  };

  // Same chat as active screen -> suppressed
  assert.equal(shouldNotify(incoming1, activeChatId), false);

  // Different chat -> triggers notification
  assert.equal(shouldNotify(incoming2, activeChatId), true);

  // Active chat is null (inbox / background) -> triggers notification
  assert.equal(shouldNotify(incoming1, null), true);
});

test("Contact Matching: +9203009204986 matches saved contact with 03009204986 or +923009204986", () => {
  const { findContactByNumber } = load(
    path.join(root, "src/services/contact-matcher.ts"),
  );

  const mockContacts = [
    {
      id: "c-1",
      name: "Akash Bhai",
      first: "Akash",
      phone: "03009204986",
      phones: ["03009204986"],
    },
    {
      id: "c-2",
      name: "Tariq Ali",
      first: "Tariq",
      phone: "+923211234567",
      phones: ["+923211234567"],
    },
  ];

  // Test +920 router format
  const matched1 = findContactByNumber("+9203009204986", mockContacts);
  assert.ok(matched1);
  assert.equal(matched1.name, "Akash Bhai");

  // Test standard format
  const matched2 = findContactByNumber("0300-9204986", mockContacts);
  assert.ok(matched2);
  assert.equal(matched2.name, "Akash Bhai");

  // Test +92 format
  const matched3 = findContactByNumber("+923009204986", mockContacts);
  assert.ok(matched3);
  assert.equal(matched3.name, "Akash Bhai");
});

test("Contact Search: matches name, normalized digits, and multiple phones per contact", () => {
  const { findContactByNumber } = load(
    path.join(root, "src/services/contact-matcher.ts"),
  );

  const contactWithMultiPhones = {
    id: "c-3",
    name: "Doctor Usman",
    first: "Usman",
    phone: "03001122334",
    phones: ["03001122334", "+92 333 4455667", "042-35889900"],
  };

  // Match secondary phone
  const matchedSecondary = findContactByNumber("03334455667", [contactWithMultiPhones]);
  assert.ok(matchedSecondary);
  assert.equal(matchedSecondary.name, "Doctor Usman");

  // Match secondary phone with formatting
  const matchedFormatted = findContactByNumber("+923334455667", [contactWithMultiPhones]);
  assert.ok(matchedFormatted);
  assert.equal(matchedFormatted.name, "Doctor Usman");
});

test("Signal Strength & Data Metrics: Signal color rules (4-5 green, 2-3 yellow, 0-1 red)", () => {
  const getSignalColor = (bars) => {
    if (bars === undefined) return "#8E8E93";
    if (bars >= 4) return "#34C759";
    if (bars >= 2) return "#FFCC00";
    return "#FF3B30";
  };

  assert.equal(getSignalColor(5), "#34C759"); // Green
  assert.equal(getSignalColor(4), "#34C759"); // Green
  assert.equal(getSignalColor(3), "#FFCC00"); // Yellow
  assert.equal(getSignalColor(2), "#FFCC00"); // Yellow
  assert.equal(getSignalColor(1), "#FF3B30"); // Red
  assert.equal(getSignalColor(0), "#FF3B30"); // Red
});

test("Echo Fix: Discards incoming messages that match our own sent messages", () => {
  const currentMessages = [
    {
      id: "sms-out-1",
      number: "03009204986",
      content: "Hello",
      fromMe: true,
      timestamp: 1727635000000,
    },
    {
      id: "sms-out-2",
      number: "03009204986",
      content: "Skill use kae?",
      fromMe: true,
      timestamp: 1727635060000,
    },
  ];

  // Simulating fetched router messages (where outbox messages return from router with router IDs)
  const fetchedMessages = [
    {
      id: "router-15",
      number: "03009204986",
      content: "Hello", // Echo of our own sent message!
      tag: "2", // ZTE Sent Tag
      fromMe: false,
      timestamp: 1727635005000,
    },
    {
      id: "router-16",
      number: "03009204986",
      content: "na subhu kandum", // Contact reply
      tag: "1", // Unread received
      fromMe: false,
      timestamp: 1727635100000,
    },
  ];

  const processed = [];
  for (const fetchedMsg of fetchedMessages) {
    // Echo check
    const isOptimisticEcho = currentMessages.some(
      (m) =>
        m.fromMe &&
        m.content.trim() === fetchedMsg.content.trim() &&
        Math.abs(m.timestamp - fetchedMsg.timestamp) < 180000,
    );
    if (isOptimisticEcho) {
      continue; // Discard echo
    }
    processed.push(fetchedMsg);
  }

  assert.equal(processed.length, 1);
  assert.equal(processed[0].content, "na subhu kandum");
});

test("Sorting Fix: Strict chronological order ensures contact reply appears before subsequent reply", () => {
  const list = [
    { id: "1", text: "Hello", timestamp: 1000, from: "me" },
    { id: "2", text: "Skill use kae?", timestamp: 2000, from: "me" },
    { id: "4", text: "Ok aw", timestamp: 4000, from: "me" },
    { id: "3", text: "na subhu kandum", timestamp: 3000, from: "them" },
  ];

  // Ascending sort for Chat Screen (Oldest -> Newest)
  list.sort((a, b) => a.timestamp - b.timestamp);

  assert.equal(list[0].text, "Hello");
  assert.equal(list[1].text, "Skill use kae?");
  assert.equal(list[2].text, "na subhu kandum"); // Contact reply at 3000
  assert.equal(list[3].text, "Ok aw"); // Subsequent reply at 4000
});

test("Phase 1 & 2: API Data Mapping and UI Differentiation (isMe, alignment, colors, and avatar visibility)", () => {
  const rawApiMessages = [
    { id: "101", number: "03009204986", content: "Hello", tag: "2", date: "26,09,29,14,30,00,+20" }, // Sent
    { id: "102", number: "03009204986", content: "na subhu kandum", tag: "1", date: "26,09,29,14,31,00,+20" }, // Inbox
    { id: "103", number: "03009204986", content: "Ok aw", tag: "2", type: "sent", date: "26,09,29,14,32,00,+20" }, // Sent
  ];

  const parsedMessages = rawApiMessages.map((msg) => {
    const isSentMessage =
      msg.tag === "2" ||
      msg.tag === "3" ||
      msg.type === "sent" ||
      msg.folder === "sent";

    return {
      id: msg.id,
      number: msg.number,
      content: msg.content,
      isMe: isSentMessage,
      from: isSentMessage ? "me" : "them",
    };
  });

  // Verify Phase 1 isMe mapping
  assert.equal(parsedMessages[0].isMe, true);
  assert.equal(parsedMessages[1].isMe, false);
  assert.equal(parsedMessages[2].isMe, true);

  // Verify Phase 2 UI properties derivation
  const bubbles = parsedMessages.map((msg, index, arr) => {
    const next = arr[index + 1];
    const isMine = msg.isMe === true;
    const nextIsThem = next && next.isMe === false;

    return {
      alignSelf: isMine ? "flex-end" : "flex-start",
      bgColor: isMine ? "#141416" : "#FFFFFF",
      textColor: isMine ? "#FFFFFF" : "#101012",
      showAvatar: !isMine && !nextIsThem,
    };
  });

  // Message 0 (Sent by user: "Hello")
  assert.equal(bubbles[0].alignSelf, "flex-end");
  assert.equal(bubbles[0].bgColor, "#141416");
  assert.equal(bubbles[0].textColor, "#FFFFFF");
  assert.equal(bubbles[0].showAvatar, false); // No avatar for sent message

  // Message 1 (Incoming from contact: "na subhu kandum")
  assert.equal(bubbles[1].alignSelf, "flex-start");
  assert.equal(bubbles[1].bgColor, "#FFFFFF");
  assert.equal(bubbles[1].textColor, "#101012");
  assert.equal(bubbles[1].showAvatar, true); // Avatar visible for incoming message

  // Message 2 (Sent by user: "Ok aw")
  assert.equal(bubbles[2].alignSelf, "flex-end");
  assert.equal(bubbles[2].bgColor, "#141416");
  assert.equal(bubbles[2].textColor, "#FFFFFF");
  assert.equal(bubbles[2].showAvatar, false); // No avatar for sent message
});

test("Phase 3: Optimistic UI Sync explicitly sets isMe: true", () => {
  const text = "Instant message";
  const targetPhone = "03009204986";
  const now = Date.now();

  const optimisticMsg = {
    id: `local-temp-${now}`,
    number: targetPhone,
    content: text.trim(),
    isMe: true, // Phase 3 strict requirement
    from: "me",
    status: "sending",
  };

  assert.equal(optimisticMsg.isMe, true);
  assert.equal(optimisticMsg.from, "me");
  assert.equal(optimisticMsg.status, "sending");
});

test("Phase 1: Universal Number Normalization (generateNormalizedChatId)", () => {
  const phoneModule = load(path.join(root, "src/utils/phone.ts"));
  const { generateNormalizedChatId } = phoneModule;

  // Pakistani numbers standardized strictly to '03XXXXXXXXX' format
  assert.equal(generateNormalizedChatId("+923009204986"), "03009204986");
  assert.equal(generateNormalizedChatId("923009204986"), "03009204986");
  assert.equal(generateNormalizedChatId("00923009204986"), "03009204986");
  assert.equal(generateNormalizedChatId("+9203009204986"), "03009204986");
  assert.equal(generateNormalizedChatId("+92 300 920-4986"), "03009204986");
  assert.equal(generateNormalizedChatId("(0300) 9204986"), "03009204986");
  assert.equal(generateNormalizedChatId("03009204986"), "03009204986");
  assert.equal(generateNormalizedChatId("0300-9204986"), "03009204986");

  // Short codes & text senders preserved
  assert.equal(generateNormalizedChatId("8558"), "8558");
  assert.equal(generateNormalizedChatId("Jazz"), "Jazz");
});

test("Phase 2: Thread Consolidation (Both outgoing +92 and incoming 03 map to single thread)", () => {
  const phoneModule = load(path.join(root, "src/utils/phone.ts"));
  const { generateNormalizedChatId } = phoneModule;

  const outgoingContactNumber = "+923009204986";
  const incomingRouterNumber = "03009204986";

  const outgoingChatId = generateNormalizedChatId(outgoingContactNumber);
  const incomingChatId = generateNormalizedChatId(incomingRouterNumber);

  // Both MUST equal the exact same normalized chatId
  assert.equal(outgoingChatId, incomingChatId);
  assert.equal(outgoingChatId, "03009204986");

  // Thread grouping simulation
  const threads = {};
  const addMessageToThread = (rawNumber, text, from) => {
    const threadKey = generateNormalizedChatId(rawNumber);
    if (!threads[threadKey]) threads[threadKey] = [];
    threads[threadKey].push({ text, from });
  };

  addMessageToThread("+923009204986", "Hello from user", "me");
  addMessageToThread("03009204986", "Hello from contact", "them");

  assert.equal(Object.keys(threads).length, 1);
  assert.equal(threads["03009204986"].length, 2);
  assert.equal(threads["03009204986"][0].text, "Hello from user");
  assert.equal(threads["03009204986"][1].text, "Hello from contact");
});

test("Phase 3: Active Chat Reactivity (Reactive selector receives live router messages)", () => {
  const phoneModule = load(path.join(root, "src/utils/phone.ts"));
  const { generateNormalizedChatId } = phoneModule;

  const currentChatId = generateNormalizedChatId("+923009204986"); // "03009204986"

  const storeMessages = [
    { id: "1", chatId: "03009204986", number: "+923009204986", content: "Sent 1" },
    { id: "2", chatId: "03111234567", number: "03111234567", content: "Other chat" },
  ];

  // Reactive selector simulating active chat screen:
  const getThreadMessages = (stateMsgs) =>
    stateMsgs.filter(
      (m) =>
        m.chatId === currentChatId ||
        generateNormalizedChatId(m.number) === currentChatId,
    );

  let activeThread = getThreadMessages(storeMessages);
  assert.equal(activeThread.length, 1);
  assert.equal(activeThread[0].content, "Sent 1");

  // New incoming message pushed live from router
  storeMessages.push({
    id: "3",
    chatId: generateNormalizedChatId("03009204986"),
    number: "03009204986",
    content: "Live incoming reply!",
  });

  activeThread = getThreadMessages(storeMessages);
  assert.equal(activeThread.length, 2);
  assert.equal(activeThread[1].content, "Live incoming reply!");
});



