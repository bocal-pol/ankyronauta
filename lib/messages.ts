export interface OverviewEntry {
  id: string;
  title: string;
  url: string;
  isOpen: boolean;
}

export interface FolderOverview {
  id: string;
  name: string;
  color: string;
  tabs: OverviewEntry[];
}

export interface Overview {
  pinned: OverviewEntry[];
  pinnedCount: number;
  maxPinned: number;
  folders: FolderOverview[];
}

export type ExtensionMessage =
  | { type: 'get-overview' }
  | { type: 'run-session-clear' }
  | { type: 'open-or-focus-entry'; entryId: string }
  | { type: 'remove-entry'; entryId: string }
  | { type: 'create-folder' }
  | { type: 'rename-folder'; folderId: string; name: string }
  | { type: 'recolor-folder'; folderId: string; color: string }
  | { type: 'delete-folder'; folderId: string };
