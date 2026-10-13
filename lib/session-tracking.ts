import { storage } from '#imports';

/**
 * entryId -> tabId. Volatile (chrome.storage.session) : un tabId n'a de sens que pour la session
 * de navigateur en cours. C'est la seule source de vérité pour savoir si une entrée épinglée/à
 * garder est actuellement ouverte — pas une comparaison d'URL, qui casserait dès qu'on navigue à
 * l'intérieur de l'onglet protégé.
 */
const entryTabsItem = storage.defineItem<Record<string, number>>('session:entryTabs', {
  fallback: {},
});

export async function getEntryTabMap(): Promise<Record<string, number>> {
  return entryTabsItem.getValue();
}

export async function setTabForEntry(entryId: string, tabId: number): Promise<void> {
  const map = await entryTabsItem.getValue();
  map[entryId] = tabId;
  await entryTabsItem.setValue(map);
}

/** À appeler depuis tabs.onRemoved — ne touche jamais aux entrées persistées, seulement au suivi volatile. */
export async function clearTabId(tabId: number): Promise<void> {
  const map = await entryTabsItem.getValue();
  let changed = false;
  for (const [entryId, mappedTabId] of Object.entries(map)) {
    if (mappedTabId === tabId) {
      delete map[entryId];
      changed = true;
    }
  }
  if (changed) await entryTabsItem.setValue(map);
}

export async function clearEntry(entryId: string): Promise<void> {
  const map = await entryTabsItem.getValue();
  if (entryId in map) {
    delete map[entryId];
    await entryTabsItem.setValue(map);
  }
}

/** folderId -> tabGroupId. Même volatilité que ci-dessus, pour les mêmes raisons. */
const folderGroupsItem = storage.defineItem<Record<string, number>>('session:folderGroups', {
  fallback: {},
});

export async function getFolderGroupMap(): Promise<Record<string, number>> {
  return folderGroupsItem.getValue();
}

export async function setFolderGroupId(folderId: string, groupId: number): Promise<void> {
  const map = await folderGroupsItem.getValue();
  map[folderId] = groupId;
  await folderGroupsItem.setValue(map);
}

export async function clearGroupId(groupId: number): Promise<void> {
  const map = await folderGroupsItem.getValue();
  let changed = false;
  for (const [folderId, mappedGroupId] of Object.entries(map)) {
    if (mappedGroupId === groupId) {
      delete map[folderId];
      changed = true;
    }
  }
  if (changed) await folderGroupsItem.setValue(map);
}
