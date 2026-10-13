import { storage } from '#imports';

/** Les 9 couleurs natives de chrome.tabGroups — aucune autre valeur n'est acceptée par l'API. */
export const GROUP_COLORS = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
] as const;

export type GroupColor = (typeof GROUP_COLORS)[number];

export interface Folder {
  id: string;
  name: string;
  color: GroupColor;
}

export interface KeptTab {
  id: string;
  url: string;
  title: string;
  folderId: string;
}

export const foldersItem = storage.defineItem<Folder[]>('sync:folders', { fallback: [] });
export const keptTabsItem = storage.defineItem<KeptTab[]>('sync:keptTabs', { fallback: [] });

export function nextFolderColor(existingFolders: Folder[]): GroupColor {
  return GROUP_COLORS[existingFolders.length % GROUP_COLORS.length] ?? 'grey';
}
