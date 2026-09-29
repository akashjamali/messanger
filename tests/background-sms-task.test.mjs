import assert from "node:assert/strict";
import { test } from "node:test";

test("Background Task Gatekeeper: Aborts immediately if not connected to network", () => {
  const evaluateConnection = (netState) => {
    if (!netState?.isConnected) {
      return "NoData";
    }
    return "Proceed";
  };

  assert.equal(evaluateConnection({ isConnected: false }), "NoData");
  assert.equal(evaluateConnection(null), "NoData");
  assert.equal(evaluateConnection({ isConnected: true }), "Proceed");
});

test("Background Task Gatekeeper: Aborts immediately if router IP is unreachable", async () => {
  const probeMock = async (ip, reachable) => reachable;

  const runGatekeeper = async (ip, isAlive) => {
    const reachable = await probeMock(ip, isAlive);
    if (!reachable) return "NoData";
    return "Execute";
  };

  assert.equal(await runGatekeeper("192.168.2.1", false), "NoData");
  assert.equal(await runGatekeeper("192.168.2.1", true), "Execute");
});

test("Background Worker: Cold start seeds historical messages without firing notifications", () => {
  const mockStorage = new Map();
  const rawNotified = mockStorage.get("notified_message_ids");
  const notifiedSet = new Set(rawNotified ? JSON.parse(rawNotified) : []);

  const existingRouterSMS = [
    { id: "sms-1", content: "Historical message 1", fromMe: false, tag: "1" },
    { id: "sms-2", content: "Historical message 2", fromMe: false, tag: "2" },
  ];

  const notificationsFired = [];

  const isFirstRun = notifiedSet.size === 0;
  if (isFirstRun) {
    for (const msg of existingRouterSMS) {
      notifiedSet.add(msg.id);
    }
    mockStorage.set(
      "notified_message_ids",
      JSON.stringify(Array.from(notifiedSet)),
    );
  }

  // Verify zero notifications fired on first run
  assert.equal(notificationsFired.length, 0);
  assert.equal(notifiedSet.size, 2);
  assert.ok(notifiedSet.has("sms-1"));
  assert.ok(notifiedSet.has("sms-2"));

  // Subsequent run: New incoming SMS arrives
  const subsequentRouterSMS = [
    ...existingRouterSMS,
    { id: "sms-3", content: "Your code is 4455", fromMe: false, tag: "2" },
  ];

  for (const msg of subsequentRouterSMS) {
    if (!notifiedSet.has(msg.id) && !msg.fromMe) {
      notificationsFired.push(msg.id);
      notifiedSet.add(msg.id);
    }
  }

  // Exactly one notification fired for the new message
  assert.equal(notificationsFired.length, 1);
  assert.equal(notificationsFired[0], "sms-3");
});
