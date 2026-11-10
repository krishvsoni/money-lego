"use client";

import { useSyncExternalStore } from "react";
import { api } from "@/lib/api-client";

// One source of truth for approvals waiting on the owner, shared by the bell in the nav and
// the corner notice. It polls only while something on the page is listening, refreshes the
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

interface State {
  items: PendingApproval[];
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
const EMPTY: State = { items: [], arrivals: 0, later: [], opened: [], review: null };
const OPENED_KEY = "money-lego:approvals-opened";

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

export function refreshApprovals() {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return;
  api<{ approvals: PendingApproval[] }>("/api/approvals")
    .then(({ approvals }) => {
      const fresh = approvals.filter((a) => !seen.has(a.runId));
      fresh.forEach((a) => seen.add(a.runId));
      set({ items: approvals, arrivals: fresh.length ? state.arrivals + 1 : state.arrivals });
    })
    .catch(() => {
      /* signed out or offline: the next poll tries again */
    });
}

const onShow = () => refreshApprovals();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    if (!state.later.length && !state.opened.length) state = { ...state, later: readList(LATER_KEY), opened: readList(OPENED_KEY) };
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

export function snooze(runId: string) {
  const later = [...new Set([...state.later, runId])].slice(-50);
  set({ later });
  writeList(LATER_KEY, later);
}
