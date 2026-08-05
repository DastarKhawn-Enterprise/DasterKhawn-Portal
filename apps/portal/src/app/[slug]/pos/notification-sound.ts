'use client';

/**
 * Global new-order notification sound.
 *
 * Plays a short synthesized tone (Web Audio — no asset needed) whenever a NEW
 * order is created for the current tenant. Triggering is driven by the existing
 * realtime event bus (orders → INSERT), so it works across every page and is
 * automatically tenant-scoped (each tenant has its own bus instance).
 *
 * Preferences (enabled / volume / selection) are read from
 * `settings.enabled_modules.notifications` and resolved by
 * `resolveNotificationPrefs` below.
 */

export interface NotificationPrefs {
  soundEnabled: boolean;
  volume: number; // 0..100
  sound: string; // key from SOUND_OPTIONS
}

export const SOUND_OPTIONS = [
  { value: 'ding', label: 'Ding' },
  { value: 'two-tone', label: 'Two-Tone' },
  { value: 'chime', label: 'Chime' },
] as const;

export const SOUND_DEFAULTS: NotificationPrefs = {
  soundEnabled: true,
  volume: 70,
  sound: 'ding',
};

const DEFAULT_SETTINGS = { enabled_modules: {} } as Record<string, unknown>;

/** Read notification prefs from a settings row (safe when the key is absent). */
export function resolveNotificationPrefs(
  settings: Record<string, unknown> | null | undefined,
): NotificationPrefs {
  const row = settings ?? DEFAULT_SETTINGS;
  const enabledModules = (row.enabled_modules ?? {}) as Record<string, unknown>;
  const notif = (enabledModules.notifications ?? {}) as Record<string, unknown>;
  return {
    soundEnabled:
      typeof notif.soundEnabled === 'boolean' ? notif.soundEnabled : SOUND_DEFAULTS.soundEnabled,
    volume:
      typeof notif.volume === 'number'
        ? Math.max(0, Math.min(100, notif.volume))
        : SOUND_DEFAULTS.volume,
    sound: SOUND_OPTIONS.some((o) => o.value === notif.sound)
      ? (notif.sound as string)
      : SOUND_DEFAULTS.sound,
  };
}

let audioCtx: AudioContext | null = null;
let unlockAttached = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

/** Attach a one-time unlock listener so later plays are allowed by the browser. */
function ensureUnlock() {
  if (unlockAttached || typeof window === 'undefined') return;
  unlockAttached = true;
  const unlock = () => {
    getAudioContext();
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener('touchstart', unlock, { once: true });
}

/**
 * Play a notification sound. Safe to call before any user interaction; the
 * first user gesture afterwards will unlock the AudioContext so later plays
 * work under browser autoplay policies.
 */
export function playNotificationSound(prefs: NotificationPrefs) {
  if (!prefs.soundEnabled) return;
  const volume = Math.max(0, Math.min(1, prefs.volume / 100));
  if (volume <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;
  ensureUnlock();

  const now = ctx.currentTime;

  switch (prefs.sound) {
    case 'two-tone':
      tone(ctx, 880, now, 0.14, volume);
      tone(ctx, 1174.66, now + 0.14, 0.16, volume);
      break;
    case 'chime':
      tone(ctx, 659.25, now, 0.5, volume * 0.8);
      tone(ctx, 987.77, now + 0.09, 0.5, volume * 0.8);
      tone(ctx, 1318.51, now + 0.18, 0.55, volume * 0.8);
      break;
    case 'ding':
    default:
      tone(ctx, 1200, now, 0.22, volume);
      break;
  }
}

function tone(ctx: AudioContext, freq: number, startAt: number, duration: number, volume: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}