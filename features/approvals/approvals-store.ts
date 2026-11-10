"use client";

import { useSyncExternalStore } from "react";
import { api } from "@/lib/api-client";

// One source of truth for the person's notifications (approvals waiting on them, and
// workflows shared with them), shared by the bell in the nav and the corner notice. It polls only while something on the page is listening, refreshes the
// moment the tab comes back into view, and counts arrivals so the bell rings once per new
// approval rather than on every poll.

export interface PendingApproval {
  runId: string;
  workflowId: string;
  workflowName: string;
  nodeId: string;
  step: string;
  message: string;
  until: string | null;
  startedAt: string;
  test: boolean;
}

// A workflow someone shared with you. It counts as new until you've seen it (opened it, or
// opened the bell while it was listed); that is remembered on this device.
export interface ShareNotice {
  shareId: string;
  workflowId: string;
  workflowName: string;
  ownerName: string;
  role: "viewer" | "editor";
  sharedAt: string;
}

interface State {
  items: PendingApproval[];
  shares: ShareNotice[];
  // Share ids already seen on this device.
  seenShares: string[];
  // Bumped whenever an approval we haven't seen before shows up.
  arrivals: number;
  // Run ids the owner chose to see "Later" this session; the bell still lists them.
  later: string[];
  // Run ids opened at least once this session; the rest show an unread dot.
  opened: string[];
  review: PendingApproval | null;
}

const POLL_MS = 15_000;
const LATER_KEY = "money-lego:approvals-later";
const EMPTY: State = { items: [], shares: [], seenShares: [], arrivals: 0, later: [], opened: [], review: null };
const OPENED_KEY = "money-lego:approvals-opened";
const SEEN_SHARES_KEY = "money-lego:shares-seen";

let state: State = EMPTY;
const listeners = new Set<() => void>();
const seen = new Set<string>();
let timer: ReturnType<typeof setInterval> | null = null;

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function readList(key: string): string[] {
  try {
    return JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function writeList(key: string, list: string[]) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* storage blocked: it lasts until the page reloads */
  }
}
// Seen shares outlive the tab, so an old share doesn't ring again every visit.
function readSeen(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(SEEN_SHARES_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function writeSeen(list: string[]) {
  try {
    window.localStorage.setItem(SEEN_SHARES_KEY, JSON.stringify(list.slice(-200)));
  } catch {
    /* storage blocked: shares show as new until the page reloads */
  }
}

export function refreshApprovals() {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return;
  api<{ approvals: PendingApproval[]; shares?: ShareNotice[] }>("/api/approvals")
    .then(({ approvals, shares = [] }) => {
      const fresh = approvals.filter((a) => !seen.has(a.runId));
      fresh.forEach((a) => seen.add(a.runId));
      const freshShares = shares.filter((s) => !seen.has(`share:${s.shareId}`) && !state.seenShares.includes(s.shareId));
      shares.forEach((s) => seen.add(`share:${s.shareId}`));
      set({ items: approvals, shares, arrivals: fresh.length || freshShares.length ? state.arrivals + 1 : state.arrivals });
    })
    .catch(() => {
      /* signed out or offline: the next poll tries again */
    });
}

const onShow = () => refreshApprovals();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    if (!state.later.length && !state.opened.length) state = { ...state, later: readList(LATER_KEY), opened: readList(OPENED_KEY), seenShares: readSeen() };
    refreshApprovals();
    timer = setInterval(refreshApprovals, POLL_MS);
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    }
  };
}

export function useApprovals(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
}

export function openReview(item: PendingApproval) {
  const opened = state.opened.includes(item.runId) ? state.opened : [...state.opened, item.runId].slice(-100);
  set({ review: item, opened });
  writeList(OPENED_KEY, opened);
}

export function closeReview() {
  set({ review: null });
}

export function markSharesSeen(shareIds: string[]) {
  const next = [...new Set([...state.seenShares, ...shareIds])];
  if (next.length === state.seenShares.length) return;
  set({ seenShares: next });
  writeSeen(next);
}

export function snooze(runId: string) {
  const later = [...new Set([...state.later, runId])].slice(-50);
  set({ later });
  writeList(LATER_KEY, later);
}
