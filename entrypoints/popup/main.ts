import './style.css';
import { browser } from '#imports';
import type { ExtensionMessage, Overview, OverviewEntry } from '@/lib/messages';

/** Correspondance avec les 9 couleurs natives chrome.tabGroups, pour l'affichage uniquement. */
const COLOR_HEX: Record<string, string> = {
  grey: '#80868b',
  blue: '#2563eb',
  red: '#dc2626',
  yellow: '#ca8a04',
  green: '#16a34a',
  pink: '#db2777',
  purple: '#9333ea',
  cyan: '#0891b2',
  orange: '#ea580c',
};

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <h1>Ankyronauta</h1>
  <h2>Épinglés <span class="counter" id="pinned-counter"></span></h2>
  <ul class="entry-list" id="pinned-list"></ul>
  <div id="folders-container"></div>
  <button id="clear-session-btn" type="button">Nouvelle session (effacer les autres onglets)</button>
  <a class="settings-link" href="#" id="open-options">Gérer les dossiers</a>
`;

const pinnedListEl = document.querySelector<HTMLUListElement>('#pinned-list')!;
const pinnedCounterEl = document.querySelector<HTMLSpanElement>('#pinned-counter')!;
const foldersContainerEl = document.querySelector<HTMLDivElement>('#folders-container')!;

document.querySelector<HTMLAnchorElement>('#open-options')!.addEventListener('click', (e) => {
  e.preventDefault();
  browser.runtime.openOptionsPage();
});

document.querySelector<HTMLButtonElement>('#clear-session-btn')!.addEventListener('click', async () => {
  const message: ExtensionMessage = { type: 'run-session-clear' };
  await browser.runtime.sendMessage(message);
  window.close();
});

function renderEntryRow(entry: OverviewEntry, list: HTMLUListElement): void {
  const li = document.createElement('li');
  li.className = 'entry-row';

  const dot = document.createElement('span');
  dot.className = `dot${entry.isOpen ? ' open' : ''}`;
  dot.title = entry.isOpen ? 'Ouvert' : 'Fermé';

  const titleBtn = document.createElement('button');
  titleBtn.className = 'entry-title';
  titleBtn.textContent = entry.title;
  titleBtn.title = entry.url;
  titleBtn.addEventListener('click', async () => {
    const message: ExtensionMessage = { type: 'open-or-focus-entry', entryId: entry.id };
    await browser.runtime.sendMessage(message);
    window.close();
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-btn';
  removeBtn.textContent = '✕';
  removeBtn.title = 'Retirer définitivement';
  removeBtn.addEventListener('click', async () => {
    const message: ExtensionMessage = { type: 'remove-entry', entryId: entry.id };
    await browser.runtime.sendMessage(message);
    await loadOverview();
  });

  li.append(dot, titleBtn, removeBtn);
  list.append(li);
}

function render(overview: Overview): void {
  pinnedCounterEl.textContent = `(${overview.pinnedCount}/${overview.maxPinned})`;
  pinnedListEl.innerHTML = '';
  if (overview.pinned.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = 'Aucun onglet épinglé — clic droit sur une page pour en ajouter un.';
    pinnedListEl.append(p);
  } else {
    for (const entry of overview.pinned) renderEntryRow(entry, pinnedListEl);
  }

  foldersContainerEl.innerHTML = '';
  for (const folder of overview.folders) {
    const h2 = document.createElement('h2');
    const swatch = document.createElement('span');
    swatch.className = 'folder-swatch';
    swatch.style.background = COLOR_HEX[folder.color] ?? '#80868b';
    swatch.style.display = 'inline-block';
    swatch.style.marginRight = '0.4rem';
    h2.append(swatch, document.createTextNode(folder.name));

    const ul = document.createElement('ul');
    ul.className = 'entry-list';
    if (folder.tabs.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty-state';
      p.textContent = 'Dossier vide.';
      foldersContainerEl.append(h2, p);
    } else {
      for (const entry of folder.tabs) renderEntryRow(entry, ul);
      foldersContainerEl.append(h2, ul);
    }
  }
}

async function loadOverview(): Promise<void> {
  const message: ExtensionMessage = { type: 'get-overview' };
  const overview = (await browser.runtime.sendMessage(message)) as Overview;
  render(overview);
}

void loadOverview();
