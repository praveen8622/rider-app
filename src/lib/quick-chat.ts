import type { IconName } from '@/components/icon';

/**
 * One-tap messages for riding: no typing on the bike. Only the id travels over the network;
 * the text and icon come from this list on each phone.
 */
export const QUICK_MESSAGES = [
  { id: 'traffic', text: 'Traffic jam ahead', icon: 'car-multiple', tone: 'warn' },
  { id: 'blocked', text: 'Road blocked, no way', icon: 'road-variant', tone: 'danger' },
  { id: 'offroad', text: 'Off-road ahead', icon: 'terrain', tone: 'warn' },
  { id: 'potholes', text: 'Potholes ahead', icon: 'alert-octagon-outline', tone: 'warn' },
  { id: 'police', text: 'Police check ahead', icon: 'police-badge-outline', tone: 'warn' },
  { id: 'slow', text: 'Slow down', icon: 'speedometer-slow', tone: 'warn' },
  { id: 'wait', text: 'Stop, wait for me', icon: 'hand-back-right-outline', tone: 'danger' },
  { id: 'regroup', text: 'Regroup here', icon: 'map-marker-radius-outline', tone: 'info' },
  { id: 'fuel', text: 'Need fuel', icon: 'gas-station-outline', tone: 'info' },
  { id: 'tea', text: 'Tea break', icon: 'coffee-outline', tone: 'info' },
  { id: 'problem', text: 'Bike problem', icon: 'wrench-outline', tone: 'danger' },
  { id: 'ok', text: 'All good', icon: 'thumb-up-outline', tone: 'ok' },
] as const satisfies readonly { id: string; text: string; icon: IconName; tone: 'warn' | 'danger' | 'info' | 'ok' }[];

export type QuickMessage = (typeof QUICK_MESSAGES)[number];
export type QuickMessageId = QuickMessage['id'];

const BY_ID = new Map<string, QuickMessage>(QUICK_MESSAGES.map((m) => [m.id, m]));
export const quickMessage = (id: string) => BY_ID.get(id) ?? null;
