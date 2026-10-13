import { storage } from '#imports';

export interface PinnedTab {
  id: string;
  url: string;
  title: string;
}

export const MAX_PINNED = 9;

export const pinnedTabsItem = storage.defineItem<PinnedTab[]>('sync:pinnedTabs', {
  fallback: [],
});

export function canPin(pinned: PinnedTab[]): boolean {
  return pinned.length < MAX_PINNED;
}
