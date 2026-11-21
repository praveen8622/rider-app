import type { IconName } from '@/components/icon';

export type QuickTone = 'warn' | 'danger' | 'info' | 'ok';
/** Where a message sits in the picker: what needs attention now, what's on the road, what's next. */
export type QuickGroup = 'urgent' | 'road' | 'plan';

/**
 * One-tap messages for riding: no typing on the bike. Only the id travels over the network;
 * the text and icon come from this list on each phone.
 */
export const QUICK_MESSAGES = [
  { id: 'wait', text: 'Stop, wait for me', short: 'Wait for me', icon: 'hand-back-right', tone: 'danger', group: 'urgent' },
  { id: 'problem', text: 'Bike problem', short: 'Bike problem', icon: 'wrench', tone: 'danger', group: 'urgent' },
  { id: 'traffic', text: 'Traffic jam ahead', short: 'Traffic jam', icon: 'car-multiple', tone: 'warn', group: 'road' },
  { id: 'blocked', text: 'Road blocked, no way', short: 'Road blocked', icon: 'road-variant', tone: 'warn', group: 'road' },
  { id: 'offroad', text: 'Off-road ahead', short: 'Off-road', icon: 'terrain', tone: 'warn', group: 'road' },
  { id: 'potholes', text: 'Potholes ahead', short: 'Potholes', icon: 'alert-octagon', tone: 'warn', group: 'road' },
  { id: 'police', text: 'Police check ahead', short: 'Police check', icon: 'police-badge', tone: 'warn', group: 'road' },
  { id: 'slow', text: 'Slow down', short: 'Slow down', icon: 'speedometer-slow', tone: 'warn', group: 'road' },
  { id: 'regroup', text: 'Regroup here', short: 'Regroup here', icon: 'map-marker-radius', tone: 'info', group: 'plan' },
  { id: 'fuel', text: 'Need fuel', short: 'Need fuel', icon: 'gas-station', tone: 'info', group: 'plan' },
  { id: 'tea', text: 'Tea break', short: 'Tea break', icon: 'coffee', tone: 'info', group: 'plan' },
  { id: 'ok', text: 'All good', short: 'All good', icon: 'thumb-up', tone: 'ok', group: 'plan' },
] as const satisfies readonly {
  id: string;
  /** Full sentence, for the banner and voice. */
  text: string;
  /** Fits a small tile. */
  short: string;
  icon: IconName;
  tone: QuickTone;
  group: QuickGroup;
}[];

export type QuickMessage = (typeof QUICK_MESSAGES)[number];
export type QuickMessageId = QuickMessage['id'];

const BY_ID = new Map<string, QuickMessage>(QUICK_MESSAGES.map((m) => [m.id, m]));
export const quickMessage = (id: string) => BY_ID.get(id) ?? null;
