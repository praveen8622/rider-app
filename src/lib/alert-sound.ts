import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Platform, Vibration } from 'react-native';

let player: AudioPlayer | null = null;

/**
 * Sets up the warning beep. Plays even with the iPhone's silent switch on (a speed warning
 * shouldn't be muted), and only lowers music or a call instead of stopping it.
 * The same audio session also lets voice alerts play in silent mode.
 */
export async function prepareAlertSound() {
  if (player) return;
  await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' });
  player = createAudioPlayer(require('@/assets/sounds/overspeed.wav'));
  player.volume = 1;
}

/** One beep + buzz. Called repeatedly while the rider stays over the limit. */
export function playOverspeedAlert() {
  // iOS ignores vibration patterns and always buzzes for ~0.4 s; Android gets a double buzz.
  Vibration.vibrate(Platform.OS === 'android' ? [0, 400, 150, 400] : 400);
  if (!player) return;
  player.seekTo(0).then(() => player?.play()).catch(() => {});
}

export function releaseAlertSound() {
  player?.remove();
  player = null;
}
