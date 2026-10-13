export interface KeepEntry {
  id: string;
  url: string;
  pinned: boolean;
  folderId?: string;
}

export interface ReconciliationPlan {
  /** tabId des onglets à fermer définitivement (ni épinglés ni gardés). */
  toClose: number[];
  /** Entrées épinglées/gardées qui n'ont actuellement aucun onglet ouvert — à rouvrir. */
  toOpen: KeepEntry[];
}

/**
 * Décide quoi fermer et quoi rouvrir, sans jamais appeler l'API chrome.tabs — reste pure et
 * testable. Le lien entrée->onglet (entryTabMap) est la seule source de vérité pour savoir si une
 * entrée est ouverte : jamais une comparaison d'URL, qui casserait dès qu'on navigue à l'intérieur
 * d'un onglet protégé (ex. Gmail inbox -> un email ouvert).
 */
export function planReconciliation(
  entries: KeepEntry[],
  entryTabMap: Record<string, number>,
  allOpenTabIds: ReadonlySet<number>,
): ReconciliationPlan {
  const protectedTabIds = new Set<number>();
  for (const entry of entries) {
    const tabId = entryTabMap[entry.id];
    if (tabId != null && allOpenTabIds.has(tabId)) {
      protectedTabIds.add(tabId);
    }
  }

  const toClose = [...allOpenTabIds].filter((id) => !protectedTabIds.has(id));

  const toOpen = entries.filter((entry) => {
    const tabId = entryTabMap[entry.id];
    return tabId == null || !allOpenTabIds.has(tabId);
  });

  return { toClose, toOpen };
}
