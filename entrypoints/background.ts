import { browser } from '#imports';
import type { Browser } from '#imports';
import { pinnedTabsItem, canPin, type PinnedTab } from '@/lib/pinned-storage';
import { foldersItem, keptTabsItem, nextFolderColor, type Folder, type GroupColor } from '@/lib/folders-storage';
import {
  getEntryTabMap,
  setTabForEntry,
  clearTabId,
  clearEntry,
  getFolderGroupMap,
  setFolderGroupId,
  clearGroupId,
} from '@/lib/session-tracking';
import { planReconciliation, type KeepEntry } from '@/lib/keeper-rules';
import type { ExtensionMessage, Overview, OverviewEntry, FolderOverview } from '@/lib/messages';

type BrowserTab = Browser.tabs.Tab;

const MENU_PIN = 'ankyronauta-toggle-pin';
const MENU_ADD_FOLDER_PARENT = 'ankyronauta-add-folder-parent';
const MENU_FOLDER_PREFIX = 'ankyronauta-folder-';
const MENU_NEW_FOLDER = 'ankyronauta-new-folder';
const MENU_REMOVE = 'ankyronauta-remove';

function toEntries(pinned: PinnedTab[], kept: Awaited<ReturnType<typeof keptTabsItem.getValue>>): KeepEntry[] {
  return [
    ...pinned.map((p) => ({ id: p.id, url: p.url, pinned: true })),
    ...kept.map((k) => ({ id: k.id, url: k.url, pinned: false, folderId: k.folderId })),
  ];
}

async function getAllOpenTabIds(): Promise<Set<number>> {
  const tabs = await browser.tabs.query({});
  return new Set(tabs.filter((t): t is BrowserTab & { id: number } => t.id != null).map((t) => t.id));
}

async function addTabToFolderGroup(tabId: number, folder: Folder): Promise<void> {
  const groups = await getFolderGroupMap();
  const existingGroupId = groups[folder.id];
  if (existingGroupId != null) {
    const stillExists = await browser.tabGroups.get(existingGroupId).catch(() => null);
    if (stillExists) {
      await browser.tabs.group({ tabIds: [tabId], groupId: existingGroupId }).catch(() => {});
      return;
    }
  }
  const newGroupId = await browser.tabs.group({ tabIds: [tabId] });
  await browser.tabGroups.update(newGroupId, { title: folder.name, color: folder.color });
  await setFolderGroupId(folder.id, newGroupId);
}

async function openEntry(entry: KeepEntry): Promise<void> {
  const newTab = await browser.tabs.create({
    url: entry.url || undefined,
    pinned: entry.pinned,
    active: false,
  });
  if (newTab.id == null) return;
  await setTabForEntry(entry.id, newTab.id);

  if (!entry.pinned && entry.folderId) {
    const folders = await foldersItem.getValue();
    const folder = folders.find((f) => f.id === entry.folderId);
    if (folder) await addTabToFolderGroup(newTab.id, folder);
  }
}

async function runReconciliation(): Promise<void> {
  const [pinned, kept, entryTabMap, allOpenTabIds] = await Promise.all([
    pinnedTabsItem.getValue(),
    keptTabsItem.getValue(),
    getEntryTabMap(),
    getAllOpenTabIds(),
  ]);
  const entries = toEntries(pinned, kept);
  const plan = planReconciliation(entries, entryTabMap, allOpenTabIds);

  // Garde-fou : si on s'apprête à tout fermer sans rien rouvrir, ne pas vider Chrome entièrement.
  if (plan.toOpen.length === 0 && allOpenTabIds.size > 0 && plan.toClose.length === allOpenTabIds.size) {
    await browser.tabs.create({});
  }

  for (const entry of plan.toOpen) {
    await openEntry(entry);
  }
  for (const tabId of plan.toClose) {
    await browser.tabs.remove(tabId).catch(() => {});
  }
}

async function findEntryIdForTab(tabId: number): Promise<string | null> {
  const map = await getEntryTabMap();
  for (const [entryId, mappedTabId] of Object.entries(map)) {
    if (mappedTabId === tabId) return entryId;
  }
  return null;
}

async function togglePinForTab(tab: BrowserTab): Promise<void> {
  if (tab.id == null) return;
  const existingEntryId = await findEntryIdForTab(tab.id);
  const pinned = await pinnedTabsItem.getValue();

  if (existingEntryId && pinned.some((p) => p.id === existingEntryId)) {
    await pinnedTabsItem.setValue(pinned.filter((p) => p.id !== existingEntryId));
    await clearEntry(existingEntryId);
    await browser.tabs.update(tab.id, { pinned: false }).catch(() => {});
    return;
  }

  if (!canPin(pinned)) return;

  const entry: PinnedTab = { id: crypto.randomUUID(), url: tab.url ?? '', title: tab.title ?? tab.url ?? 'Onglet' };
  await pinnedTabsItem.setValue([...pinned, entry]);
  await setTabForEntry(entry.id, tab.id);
  await browser.tabs.update(tab.id, { pinned: true }).catch(() => {});
}

async function addTabToFolder(tab: BrowserTab, folderId: string): Promise<void> {
  if (tab.id == null) return;
  const kept = await keptTabsItem.getValue();
  const existingEntryId = await findEntryIdForTab(tab.id);
  const existing = kept.find((k) => k.id === existingEntryId);

  if (existing) {
    await keptTabsItem.setValue(kept.map((k) => (k.id === existing.id ? { ...k, folderId } : k)));
  } else {
    const entry = { id: crypto.randomUUID(), url: tab.url ?? '', title: tab.title ?? tab.url ?? 'Onglet', folderId };
    await keptTabsItem.setValue([...kept, entry]);
    await setTabForEntry(entry.id, tab.id);
  }

  const folders = await foldersItem.getValue();
  const folder = folders.find((f) => f.id === folderId);
  if (folder) await addTabToFolderGroup(tab.id, folder);
}

async function createFolderAndAddTab(tab: BrowserTab): Promise<void> {
  const folders = await foldersItem.getValue();
  const folder: Folder = {
    id: crypto.randomUUID(),
    name: `Dossier ${folders.length + 1}`,
    color: nextFolderColor(folders),
  };
  await foldersItem.setValue([...folders, folder]);
  await addTabToFolder(tab, folder.id);
}

/** Retire une entrée (épinglée ou gardée) — n'efface jamais l'onglet lui-même, seulement son statut spécial. */
async function removeEntry(entryId: string): Promise<void> {
  const [pinned, kept, entryTabMap] = await Promise.all([
    pinnedTabsItem.getValue(),
    keptTabsItem.getValue(),
    getEntryTabMap(),
  ]);
  const tabId = entryTabMap[entryId];

  if (pinned.some((p) => p.id === entryId)) {
    await pinnedTabsItem.setValue(pinned.filter((p) => p.id !== entryId));
    if (tabId != null) await browser.tabs.update(tabId, { pinned: false }).catch(() => {});
  } else if (kept.some((k) => k.id === entryId)) {
    await keptTabsItem.setValue(kept.filter((k) => k.id !== entryId));
  }
  await clearEntry(entryId);
}

async function openOrFocusEntry(entryId: string): Promise<void> {
  const entryTabMap = await getEntryTabMap();
  const tabId = entryTabMap[entryId];
  if (tabId != null) {
    const tab = await browser.tabs.get(tabId).catch(() => null);
    if (tab) {
      await browser.tabs.update(tabId, { active: true });
      if (tab.windowId != null) await browser.windows.update(tab.windowId, { focused: true });
      return;
    }
  }

  const [pinned, kept] = await Promise.all([pinnedTabsItem.getValue(), keptTabsItem.getValue()]);
  const pinnedEntry = pinned.find((p) => p.id === entryId);
  if (pinnedEntry) {
    await openEntry({ id: pinnedEntry.id, url: pinnedEntry.url, pinned: true });
    return;
  }
  const keptEntry = kept.find((k) => k.id === entryId);
  if (keptEntry) {
    await openEntry({ id: keptEntry.id, url: keptEntry.url, pinned: false, folderId: keptEntry.folderId });
  }
}

async function getOverview(): Promise<Overview> {
  const [pinned, kept, folders, entryTabMap, allOpenTabIds] = await Promise.all([
    pinnedTabsItem.getValue(),
    keptTabsItem.getValue(),
    foldersItem.getValue(),
    getEntryTabMap(),
    getAllOpenTabIds(),
  ]);

  const isOpen = (id: string) => {
    const tabId = entryTabMap[id];
    return tabId != null && allOpenTabIds.has(tabId);
  };

  const pinnedOverview: OverviewEntry[] = pinned.map((p) => ({
    id: p.id,
    title: p.title,
    url: p.url,
    isOpen: isOpen(p.id),
  }));

  const folderOverview: FolderOverview[] = folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    color: folder.color,
    tabs: kept
      .filter((k) => k.folderId === folder.id)
      .map((k) => ({ id: k.id, title: k.title, url: k.url, isOpen: isOpen(k.id) })),
  }));

  return { pinned: pinnedOverview, pinnedCount: pinned.length, maxPinned: 9, folders: folderOverview };
}

async function createFolder(): Promise<void> {
  const folders = await foldersItem.getValue();
  const folder: Folder = {
    id: crypto.randomUUID(),
    name: `Dossier ${folders.length + 1}`,
    color: nextFolderColor(folders),
  };
  await foldersItem.setValue([...folders, folder]);
}

async function renameFolder(folderId: string, name: string): Promise<void> {
  const folders = await foldersItem.getValue();
  const trimmed = name.trim();
  await foldersItem.setValue(folders.map((f) => (f.id === folderId ? { ...f, name: trimmed || f.name } : f)));
}

async function recolorFolder(folderId: string, color: GroupColor): Promise<void> {
  const folders = await foldersItem.getValue();
  await foldersItem.setValue(folders.map((f) => (f.id === folderId ? { ...f, color } : f)));
}

/** Supprime le dossier et retire ses onglets de la liste à garder — les onglets eux-mêmes restent ouverts, redeviennent de simples onglets. */
async function deleteFolder(folderId: string): Promise<void> {
  const [folders, kept] = await Promise.all([foldersItem.getValue(), keptTabsItem.getValue()]);
  for (const entry of kept.filter((k) => k.folderId === folderId)) {
    await removeEntry(entry.id);
  }
  await foldersItem.setValue(folders.filter((f) => f.id !== folderId));
}

/** Répercute un renommage/changement de couleur de dossier sur son groupe d'onglets déjà ouvert, s'il existe. */
async function syncFolderGroups(folders: Folder[]): Promise<void> {
  const groupMap = await getFolderGroupMap();
  for (const folder of folders) {
    const groupId = groupMap[folder.id];
    if (groupId == null) continue;
    await browser.tabGroups.update(groupId, { title: folder.name, color: folder.color }).catch(() => {});
  }
}

async function rebuildContextMenus(folders: Folder[]): Promise<void> {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({ id: MENU_PIN, title: 'Épingler cet onglet', contexts: ['page'] });
  browser.contextMenus.create({ id: MENU_ADD_FOLDER_PARENT, title: 'Ajouter à un dossier', contexts: ['page'] });
  for (const folder of folders) {
    browser.contextMenus.create({
      id: MENU_FOLDER_PREFIX + folder.id,
      parentId: MENU_ADD_FOLDER_PARENT,
      title: folder.name,
      contexts: ['page'],
    });
  }
  browser.contextMenus.create({
    id: MENU_NEW_FOLDER,
    parentId: MENU_ADD_FOLDER_PARENT,
    title: 'Nouveau dossier…',
    contexts: ['page'],
  });
  browser.contextMenus.create({ id: MENU_REMOVE, title: 'Retirer de la liste', contexts: ['page'], visible: false });
}

async function updateMenuForTab(tab: BrowserTab | undefined): Promise<void> {
  if (tab?.id == null) return;
  const entryId = await findEntryIdForTab(tab.id);
  const [pinned, kept] = await Promise.all([pinnedTabsItem.getValue(), keptTabsItem.getValue()]);
  const isPinned = entryId != null && pinned.some((p) => p.id === entryId);
  const isKept = entryId != null && kept.some((k) => k.id === entryId);

  await browser.contextMenus
    .update(MENU_PIN, { title: isPinned ? 'Désépingler cet onglet' : 'Épingler cet onglet' })
    .catch(() => {});
  await browser.contextMenus
    .update(MENU_REMOVE, { visible: isPinned || isKept, title: isPinned ? 'Retirer des épinglés' : 'Retirer du dossier' })
    .catch(() => {});
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void (async () => {
      const folders = await foldersItem.getValue();
      await rebuildContextMenus(folders);
    })();
  });

  browser.runtime.onStartup.addListener(() => {
    void runReconciliation();
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void clearTabId(tabId);
  });

  browser.tabGroups.onRemoved.addListener((group) => {
    void clearGroupId(group.id);
  });

  browser.tabs.onActivated.addListener(({ tabId }) => {
    void browser.tabs.get(tabId).then(updateMenuForTab).catch(() => {});
  });

  browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (tab.active && (changeInfo.url || changeInfo.status === 'complete')) {
      void updateMenuForTab(tab);
    }
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab) return;
    void (async () => {
      if (info.menuItemId === MENU_PIN) {
        await togglePinForTab(tab);
      } else if (info.menuItemId === MENU_NEW_FOLDER) {
        await createFolderAndAddTab(tab);
      } else if (info.menuItemId === MENU_REMOVE) {
        const entryId = tab.id != null ? await findEntryIdForTab(tab.id) : null;
        if (entryId) await removeEntry(entryId);
      } else if (typeof info.menuItemId === 'string' && info.menuItemId.startsWith(MENU_FOLDER_PREFIX)) {
        await addTabToFolder(tab, info.menuItemId.slice(MENU_FOLDER_PREFIX.length));
      }
      await updateMenuForTab(tab);
    })();
  });

  // Reconstruit le menu et resynchronise les groupes déjà ouverts dès que la liste de dossiers change.
  foldersItem.watch((folders) => {
    void rebuildContextMenus(folders);
    void syncFolderGroups(folders);
  });

  browser.runtime.onMessage.addListener((message: ExtensionMessage) => {
    switch (message?.type) {
      case 'get-overview':
        return getOverview();
      case 'run-session-clear':
        return runReconciliation().then(() => true);
      case 'open-or-focus-entry':
        return openOrFocusEntry(message.entryId).then(() => true);
      case 'remove-entry':
        return removeEntry(message.entryId).then(() => true);
      case 'create-folder':
        return createFolder().then(() => true);
      case 'rename-folder':
        return renameFolder(message.folderId, message.name).then(() => true);
      case 'recolor-folder':
        return recolorFolder(message.folderId, message.color as GroupColor).then(() => true);
      case 'delete-folder':
        return deleteFolder(message.folderId).then(() => true);
      default:
        return undefined;
    }
  });
});
