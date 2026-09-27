import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";

const SYSTEM = {
  sent: "file:///System/Library/Audio/UISounds/SentMessage.caf",
  received: "file:///System/Library/Audio/UISounds/ReceivedMessage.caf",
  notice: "file:///System/Library/Audio/UISounds/sms-received1.caf",
} as const;

const FALLBACK = {
  sent: require("../assets/sounds/sent.wav"),
  received: require("../assets/sounds/received.wav"),
  notice: require("../assets/sounds/notice.wav"),
} as const;

type Cue = keyof typeof SYSTEM;

const players = new Map<Cue, AudioPlayer>();
const usedFallback = new Set<Cue>();
let modeReady: Promise<void> | null = null;

function prepareAudio() {
  if (!modeReady) {
    modeReady = setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
    }).catch(() => undefined);
  }
  return modeReady;
}

function replay(player: AudioPlayer) {
  const started = player.seekTo(0);
  const go = () => player.play();
  if (started && typeof (started as Promise<void>).then === "function") {
    (started as Promise<void>).then(go).catch(go);
  } else {
    go();
  }
}

export function playMessageSound(kind: Cue) {
  prepareAudio().then(() => {
    try {
      let player = players.get(kind);
      if (!player) {
        player = createAudioPlayer(usedFallback.has(kind) ? FALLBACK[kind] : { uri: SYSTEM[kind] });
        players.set(kind, player);
      }
      replay(player);
      if (!usedFallback.has(kind)) {
        const current = player;
        setTimeout(() => {
          const status = current.currentStatus;
          if (status?.isLoaded && status.duration > 0) return;
          usedFallback.add(kind);
          current.replace(FALLBACK[kind]);
          replay(current);
        }, 400);
      }
    } catch {
      // Sound could not start.
    }
  });
}

export function hapticDeleteAsk() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}

export function hapticDeleteConfirm() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
}

export function hapticSelection() {
  Haptics.selectionAsync().catch(() => undefined);
}

export function hapticSend() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

export function hapticReceive() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
