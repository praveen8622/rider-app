import type { SQLiteDatabase } from 'expo-sqlite';
import {
  get,
  limitToLast,
  onChildAdded,
  onValue,
  push,
  query,
  ref,
  serverTimestamp,
  set,
  update,
  type DataSnapshot,
  type Unsubscribe,
} from 'firebase/database';
import { useSyncExternalStore } from 'react';

import { saveSetting } from '@/db/settings';
import { database, ensureSignedIn } from '@/lib/firebase';
import { distanceMeters, msToKmh, type LatLng } from '@/lib/geo';
import { isAvatarPreset, photoThumbnail, type AvatarChoice } from '@/lib/rider-avatar';

/**
 * Group rides on Firebase Realtime Database:
 *
 *   groups/{CODE}/meta          { leader, createdAt, ended? }   anyone signed in can read (to join)
 *   groups/{CODE}/members/{uid} { name, bike?, joinedAt }        members only
 *   groups/{CODE}/pos/{uid}     { lat, lng, spd, hdg?, t }       members only, each rider writes their own
 *
 * The rules that enforce this are in firebase/database.rules.json.
 */

export const MAX_RIDERS = 15;
/** No position for this long: shown grey as "last seen". */
export const STALE_AFTER_MS = 60_000;
/** Digits only: easy to read out over the phone or type on a number pad. */
const CODE_ALPHABET = '0123456789';
export const CODE_LENGTH = 6;
// Each position goes to every other rider: 15 riders every 4 s stays far inside the free plan.
const SEND_EVERY_MS = 4_000;
/** Standing still: only refresh "last seen" this often. */
const HEARTBEAT_MS = 30_000;
const MIN_MOVE_M = 10;

const RIDER_COLORS = [
  '#2563EB', '#16A34A', '#DB2777', '#7C3AED', '#0891B2', '#CA8A04', '#DC2626', '#4F46E5',
  '#059669', '#C026D3', '#0D9488', '#9333EA', '#65A30D', '#E11D48', '#0284C7',
];
export const STALE_COLOR = '#9CA3AF';

export class GroupError extends Error {}

export type RiderIdentity = {
  name: string;
  bike: string | null;
  /** Picked avatar, or 'photo' to share `photoUri`, or null for initials. */
  avatar: AvatarChoice;
  /** Local profile photo, if any. */
  photoUri: string | null;
};

type MemberRecord = { name: string; bike?: string; avatar?: string; joinedAt: number };
type PositionRecord = { lat: number; lng: number; spd: number; hdg?: number; t: number };

export const NICKNAME_MAX = 24;

export type Rider = {
  uid: string;
  /** What to call them: the group's nickname if one is set, else their own name. */
  name: string;
  /** Their own (profile) name. */
  realName: string;
  nickname: string | null;
  avatar: string | null;
  /** True when someone in the group picked this avatar for them (it replaces their own look). */
  avatarByGroup: boolean;
  /** Small shared photo (data URI), if they share one. */
  photo: string | null;
  bike: string | null;
  isMe: boolean;
  isLeader: boolean;
  color: string;
  position: LatLng | null;
  speedKmh: number;
  heading: number | null;
  /** Server time of the last position, or null if none yet. */
  seenAt: number | null;
  stale: boolean;
};

/** Where the leader is taking the group. */
export type GroupDestination = LatLng & { name: string };

type State = {
  code: string | null;
  me: string | null;
  leader: string | null;
  ended: boolean;
  destination: GroupDestination | null;
  connected: boolean;
  members: Record<string, MemberRecord>;
  positions: Record<string, PositionRecord>;
  /** Nicknames anyone in the group gave a rider, by uid. */
  nicknames: Record<string, string>;
  /** Avatars anyone in the group picked for a rider, by uid. */
  looks: Record<string, string>;
  photos: Record<string, string>;
  /** Server clock minus phone clock, so "last seen" is right even if the phone's clock is off. */
  serverOffset: number;
};

const EMPTY: State = {
  code: null,
  me: null,
  leader: null,
  ended: false,
  destination: null,
  connected: true,
  members: {},
  positions: {},
  nicknames: {},
  looks: {},
  photos: {},
  serverOffset: 0,
};

let state = EMPTY;
const codeListeners = new Set<() => void>();
const liveListeners = new Set<() => void>();
const summaryListeners = new Set<() => void>();
let detachCore: Unsubscribe | null = null;
let detachInfo: Unsubscribe | null = null;
let detachPos: Unsubscribe | null = null;
let lastSent: { point: LatLng; at: number } | null = null;

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  codeListeners.forEach((l) => l());
  liveListeners.forEach((l) => l());
  summaryListeners.forEach((l) => l());
}

const warn = (what: string) => (e: unknown) => console.warn(`Group ride: ${what}`, e);

/** Connection state and clock offset: local to the SDK, they cost no data. */
function attachCore() {
  detachCore?.();
  detachCore = null;
  if (!state.code) return;
  const offs = [
    onValue(ref(database, '.info/connected'), (s) => setState({ connected: s.val() === true })),
    onValue(ref(database, '.info/serverTimeOffset'), (s) => setState({ serverOffset: Number(s.val()) || 0 })),
  ];
  detachCore = () => offs.forEach((off) => off());
}

/**
 * Group data, only while a screen shows it. Who's in it (names, avatars, leader, destination)
 * for any group view; positions, the chatty part, only for screens that show the map.
 */
function attachLive() {
  const code = state.code;
  const wantInfo = !!code && liveListeners.size + summaryListeners.size > 0;
  const wantPos = !!code && liveListeners.size > 0;
  if (!wantInfo && detachInfo) {
    detachInfo();
    detachInfo = null;
  }
  if (!wantPos && detachPos) {
    detachPos();
    detachPos = null;
  }
  if (wantPos && !detachPos) {
    detachPos = onValue(
      ref(database, `groups/${code}/pos`),
      (s) => setState({ positions: s.val() ?? {} }),
      warn('positions'),
    );
  }
  if (!wantInfo || detachInfo) return;
  const base = `groups/${code}`;
  const offs = [
    onValue(
      ref(database, `${base}/meta`),
      (s: DataSnapshot) => {
        const meta = s.val() as {
          leader?: string;
          ended?: boolean;
          dest?: { lat: number; lng: number; name: string };
        } | null;
        const d = meta?.dest;
        const same =
          d && state.destination?.latitude === d.lat && state.destination.longitude === d.lng && state.destination.name === d.name;
        setState({
          leader: meta?.leader ?? null,
          ended: !meta || !!meta.ended,
          // Keep the same object when unchanged, so maps don't redraw the flag on every update.
          destination: d ? (same ? state.destination : { latitude: d.lat, longitude: d.lng, name: d.name }) : null,
        });
      },
      warn('meta'),
    ),
    onValue(ref(database, `${base}/members`), (s) => setState({ members: s.val() ?? {} }), warn('members')),
    onValue(ref(database, `${base}/nick`), (s) => setState({ nicknames: s.val() ?? {} }), warn('nicknames')),
    onValue(ref(database, `${base}/look`), (s) => setState({ looks: s.val() ?? {} }), warn('looks')),
    onValue(ref(database, `${base}/photos`), (s) => setState({ photos: s.val() ?? {} }), warn('photos')),
  ];
  detachInfo = () => offs.forEach((off) => off());
}

/** Stops all group data listeners (e.g. before leaving, when the rules stop allowing reads). */
function detachData() {
  detachInfo?.();
  detachPos?.();
  detachInfo = null;
  detachPos = null;
}

function enter(code: string, me: string) {
  lastSent = null;
  detachData();
  state = { ...EMPTY, serverOffset: state.serverOffset, code, me };
  attachCore();
  attachLive();
  setState({});
}

async function exit(db: SQLiteDatabase) {
  detachData();
  detachCore?.();
  detachCore = null;
  lastSent = null;
  sharedLook = null;
  state = { ...EMPTY, serverOffset: state.serverOffset };
  setState({});
  await saveSetting(db, 'groupCode', null);
}

function friendly(e: unknown): Error {
  if (e instanceof GroupError) return e;
  const message = String((e as { message?: string })?.message ?? e);
  if (/permission/i.test(message)) {
    return new GroupError("Yatri's group server refused this. Check the database rules in Firebase.");
  }
  if (/network|offline|timeout/i.test(message)) {
    return new GroupError('No internet connection. Group rides need mobile data or Wi-Fi.');
  }
  return new GroupError(message);
}

/** Keep only the digits, so "482 193" and "482-193" both work. */
export function normalizeCode(input: string) {
  return input.replace(/\D/g, '');
}

export function isValidCode(code: string) {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code);
}

/** "482193" -> "482 193", easier to read. */
export function formatCode(code: string) {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

function makeCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

/** Name, bike and picked avatar as stored for the group. Nulls clear old values on update. */
function memberRecord(identity: RiderIdentity) {
  return {
    name: identity.name.trim().slice(0, 40) || 'Rider',
    bike: identity.bike?.trim().slice(0, 60) || null,
    avatar: isAvatarPreset(identity.avatar) ? identity.avatar : null,
  };
}

/** The photo we last shared, so screens can call syncMyLook freely without re-uploading. */
let sharedLook: { code: string; key: string } | null = null;

/**
 * Brings what the group sees of us up to date: name, bike, avatar, and the photo
 * (shrunk to a ~128px thumbnail) when the rider chose to show their profile photo.
 */
export async function syncMyLook(identity: RiderIdentity) {
  const { code, me } = state;
  if (!code || !me) return;
  const usePhoto = identity.avatar === 'photo' && !!identity.photoUri;
  const key = JSON.stringify([memberRecord(identity), usePhoto ? identity.photoUri : null]);
  if (sharedLook?.code === code && sharedLook.key === key) return;
  sharedLook = { code, key };
  try {
    await update(ref(database, `groups/${code}/members/${me}`), memberRecord(identity));
    const photo = usePhoto ? await photoThumbnail(identity.photoUri!) : null;
    await set(ref(database, `groups/${code}/photos/${me}`), photo);
  } catch (e) {
    sharedLook = null;
    console.warn('Group ride: share avatar', e);
  }
}

/** Anyone in the group can pick a ride avatar for anyone; null goes back to the rider's own look. */
export async function setRiderAvatar(uid: string, preset: string | null) {
  const { code } = state;
  if (!code) return;
  const value = isAvatarPreset(preset) ? preset : null;
  await set(ref(database, `groups/${code}/look/${uid}`), value).catch((e) => {
    throw friendly(e);
  });
}

/** Anyone in the group can nickname anyone (themselves too); everyone sees it. Empty clears it. */
/** A quick message as it arrives: who sent it, which preset, where they were. */
export type QuickChat = { key: string; uid: string; msg: string; at: number; position: LatLng | null };

/**
 * Sends one of the quick messages (see quick-chat.ts) to everyone in the group, with where
 * you are so "Traffic jam ahead" or "Regroup here" has a place.
 */
export async function sendQuickChat(msg: string, position: LatLng | null) {
  const { code, me } = state;
  if (!code || !me) return;
  const record: Record<string, unknown> = { uid: me, msg, t: serverTimestamp() };
  if (position) {
    record.lat = Math.round(position.latitude * 1e6) / 1e6;
    record.lng = Math.round(position.longitude * 1e6) / 1e6;
  }
  await push(ref(database, `groups/${code}/chat`), record).catch((e) => {
    throw friendly(e);
  });
}

/**
 * Calls `onMessage` for each quick message sent from now on (including your own). Older ones
 * aren't replayed: a "traffic jam ahead" from an hour ago is noise. Returns an unsubscribe.
 */
export function listenQuickChat(onMessage: (m: QuickChat) => void): () => void {
  const { code } = state;
  if (!code) return () => {};
  const since = Date.now() + state.serverOffset - 5_000;
  return onChildAdded(
    query(ref(database, `groups/${code}/chat`), limitToLast(1)),
    (s) => {
      const v = s.val() as { uid?: string; msg?: string; t?: number; lat?: number; lng?: number } | null;
      if (!v?.uid || !v.msg || !v.t || v.t < since) return;
      onMessage({
        key: s.key ?? String(v.t),
        uid: v.uid,
        msg: v.msg,
        at: v.t - state.serverOffset,
        position: v.lat != null && v.lng != null ? { latitude: v.lat, longitude: v.lng } : null,
      });
    },
    warn('chat'),
  );
}

export async function setNickname(uid: string, nickname: string) {
  const { code } = state;
  if (!code) return;
  const value = nickname.trim().slice(0, NICKNAME_MAX) || null;
  await set(ref(database, `groups/${code}/nick/${uid}`), value).catch((e) => {
    throw friendly(e);
  });
}

/** Starts a new group with this rider as leader. Returns its code. */
export async function createGroup(db: SQLiteDatabase, identity: RiderIdentity): Promise<string> {
  try {
    const me = await ensureSignedIn();
    // A million codes; the rules refuse one that's taken, so a clash just fails and we retry.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeCode();
      try {
        await set(ref(database, `groups/${code}/meta`), { leader: me, createdAt: serverTimestamp() });
      } catch (e) {
        if (attempt === 4) throw e;
        continue;
      }
      await set(ref(database, `groups/${code}/members/${me}`), { ...memberRecord(identity), joinedAt: serverTimestamp() });
      await saveSetting(db, 'groupCode', code);
      enter(code, me);
      syncMyLook(identity);
      return code;
    }
    throw new GroupError('Could not create a group. Try again.');
  } catch (e) {
    throw friendly(e);
  }
}

export async function joinGroup(db: SQLiteDatabase, rawCode: string, identity: RiderIdentity): Promise<void> {
  const code = normalizeCode(rawCode);
  if (!isValidCode(code)) throw new GroupError(`Group codes are ${CODE_LENGTH} digits, like 482 193.`);
  try {
    const me = await ensureSignedIn();
    const meta = await get(ref(database, `groups/${code}/meta`));
    if (!meta.exists()) throw new GroupError(`No group ride with code ${code}. Check the code and try again.`);
    if (meta.val().ended) throw new GroupError('That group ride has ended.');

    const memberRef = ref(database, `groups/${code}/members/${me}`);
    // Rejoining (e.g. after reinstalling Expo Go) keeps the original place in the group.
    const existing = await get(memberRef).catch(() => null);
    if (existing?.exists()) await update(memberRef, memberRecord(identity));
    else await set(memberRef, { ...memberRecord(identity), joinedAt: serverTimestamp() });

    // Rules can't count members, so the 16th rider to join checks and steps back out.
    const members = ((await get(ref(database, `groups/${code}/members`))).val() ?? {}) as Record<string, MemberRecord>;
    const order = Object.entries(members)
      .sort(([a, x], [b, y]) => x.joinedAt - y.joinedAt || a.localeCompare(b))
      .map(([uid]) => uid);
    if (order.indexOf(me) >= MAX_RIDERS) {
      await set(memberRef, null);
      throw new GroupError(`That group is full (${MAX_RIDERS} riders).`);
    }

    await saveSetting(db, 'groupCode', code);
    enter(code, me);
    syncMyLook(identity);
  } catch (e) {
    throw friendly(e);
  }
}

/**
 * Leaves the current group. A leader hands over to whoever joined next, or, with
 * `endForEveryone` (or when riding alone), ends the group for all.
 */
export async function leaveGroup(db: SQLiteDatabase, { endForEveryone = false } = {}) {
  const { code, me, leader, ended } = state;
  if (!code || !me) return exit(db);
  try {
    if (leader === me && !ended) {
      const members = ((await get(ref(database, `groups/${code}/members`))).val() ?? {}) as Record<string, MemberRecord>;
      const next = Object.entries(members)
        .filter(([uid]) => uid !== me)
        .sort(([a, x], [b, y]) => x.joinedAt - y.joinedAt || a.localeCompare(b))[0];
      if (endForEveryone || !next) await set(ref(database, `groups/${code}/meta/ended`), true);
      else await set(ref(database, `groups/${code}/meta/leader`), next[0]);
    }
    // Stop listening first: once we're not a member, the rules (rightly) refuse our reads.
    detachData();
    await update(ref(database, `groups/${code}`), {
      [`pos/${me}`]: null,
      [`photos/${me}`]: null,
      [`nick/${me}`]: null,
      [`look/${me}`]: null,
      [`members/${me}`]: null,
    });
  } catch (e) {
    // Offline: the removal is queued and sent when back online. Leave locally either way.
    console.warn('Group ride: leave', e);
  }
  await exit(db);
}

/** Leader only: pass the leader badge to another rider. */
export async function makeLeader(uid: string) {
  const { code, me, leader } = state;
  if (!code || leader !== me) return;
  await set(ref(database, `groups/${code}/meta/leader`), uid).catch((e) => {
    throw friendly(e);
  });
}

/** Leader only: set (or clear, with null) where the group is riding to. Everyone sees it live. */
export async function setGroupDestination(place: GroupDestination | null) {
  const { code, me, leader } = state;
  if (!code || leader !== me) throw new GroupError('Only the group leader can set the destination.');
  const value = place
    ? {
        lat: Math.round(place.latitude * 1e6) / 1e6,
        lng: Math.round(place.longitude * 1e6) / 1e6,
        name: place.name.trim().slice(0, 80) || 'Destination',
      }
    : null;
  await set(ref(database, `groups/${code}/meta/dest`), value).catch((e) => {
    throw friendly(e);
  });
}

/** On app start: reconnect to the group saved last time, if it still exists. */
export async function restoreGroup(db: SQLiteDatabase, code: string | null) {
  if (!code || state.code) return;
  let me: string | null = null;
  try {
    me = await ensureSignedIn();
    const meta = await get(ref(database, `groups/${code}/meta`));
    const member = await get(ref(database, `groups/${code}/members/${me}`)).catch(() => null);
    if (!meta.exists() || !member?.exists()) await exit(db);
    else if (!state.code) enter(code, me);
  } catch (e) {
    // Probably offline; keep the group and let the SDK reconnect.
    console.warn('Group ride: restore', e);
    if (me && !state.code) enter(code, me);
  }
}

/**
 * Shares this rider's position with the group. Called on every GPS fix; sends at most every
 * few seconds, and only a heartbeat while standing still. Skipped while offline, so a queue of
 * old positions isn't replayed when the signal comes back.
 */
export function reportGroupPosition(point: LatLng, speedMs: number, heading: number | null) {
  const { code, me, connected, ended } = state;
  if (!code || !me || !connected || ended) return;
  const now = Date.now();
  if (lastSent) {
    const since = now - lastSent.at;
    if (since < SEND_EVERY_MS) return;
    if (since < HEARTBEAT_MS && distanceMeters(lastSent.point, point) < MIN_MOVE_M) return;
  }
  lastSent = { point, at: now };
  const record: Record<string, unknown> = {
    lat: Math.round(point.latitude * 1e6) / 1e6,
    lng: Math.round(point.longitude * 1e6) / 1e6,
    spd: Math.round(msToKmh(Math.max(0, speedMs))),
    t: serverTimestamp(),
  };
  if (heading != null) record.hdg = Math.round(heading);
  set(ref(database, `groups/${code}/pos/${me}`), record).catch(warn('send position'));
}

/** Riders sorted leader first, then by when they joined. `now` is the phone's clock. */
export function ridersOf(s: GroupSnapshot, now: number): Rider[] {
  const serverNow = now + s.serverOffset;
  return Object.entries(s.members)
    .sort(([a, x], [b, y]) => (x.joinedAt ?? 0) - (y.joinedAt ?? 0) || a.localeCompare(b))
    .map(([uid, m], i): Rider => {
      const p = s.positions[uid];
      const stale = !p || serverNow - p.t > STALE_AFTER_MS;
      const realName = m.name || 'Rider';
      const nickname = s.nicknames[uid] || null;
      const groupLook = isAvatarPreset(s.looks[uid]) ? s.looks[uid] : null;
      return {
        uid,
        name: nickname ?? realName,
        realName,
        nickname,
        // An avatar the group picked wins over the rider's own avatar or photo.
        avatar: groupLook ?? m.avatar ?? null,
        avatarByGroup: !!groupLook,
        photo: groupLook ? null : (s.photos[uid] ?? null),
        bike: m.bike ?? null,
        isMe: uid === s.me,
        isLeader: uid === s.leader,
        color: RIDER_COLORS[i % RIDER_COLORS.length],
        position: p ? { latitude: p.lat, longitude: p.lng } : null,
        speedKmh: p && !stale ? p.spd : 0,
        heading: p?.hdg ?? null,
        seenAt: p ? p.t - s.serverOffset : null,
        stale,
      };
    })
    .sort((a, b) => Number(b.isLeader) - Number(a.isLeader));
}

export type GroupSnapshot = State;

function subscribeCode(listener: () => void) {
  codeListeners.add(listener);
  return () => {
    codeListeners.delete(listener);
  };
}

function subscribeLive(listener: () => void) {
  liveListeners.add(listener);
  attachLive();
  return () => {
    liveListeners.delete(listener);
    attachLive();
  };
}

function subscribeSummary(listener: () => void) {
  summaryListeners.add(listener);
  attachLive();
  return () => {
    summaryListeners.delete(listener);
    attachLive();
  };
}

const getState = () => state;

/** Outside React (e.g. to pick a screen's starting view). */
export const currentGroupCode = () => state.code;
export const isGroupLeader = () => !!state.code && state.leader === state.me;

/** The current group code only (no downloads). For badges like the Home card. */
export function useGroupCode() {
  return useSyncExternalStore(subscribeCode, () => state.code);
}

/**
 * Who's in the group (names, avatars, leader, destination) without everyone's live positions.
 * Cheap enough for the Home card.
 */
export function useGroupSummary(): GroupSnapshot {
  return useSyncExternalStore(subscribeSummary, getState);
}

/** The live group: members, positions, leader. Downloads updates while a screen uses it. */
export function useGroupRide(): GroupSnapshot {
  return useSyncExternalStore(subscribeLive, getState);
}
