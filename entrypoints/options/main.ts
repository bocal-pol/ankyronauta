import './style.css';
import { browser } from '#imports';
import { GROUP_COLORS } from '@/lib/folders-storage';
import type { ExtensionMessage, Overview } from '@/lib/messages';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <h1>Ankyronauta — Réglages</h1>
  <p class="hint">
    Les onglets épinglés et ceux rangés dans un dossier survivent à l'effacement de session et se
    rouvrent automatiquement au démarrage de Chrome. Fermer leur onglet ne les retire pas d'ici —
    seule une suppression explicite (ci-dessous) le fait.
  </p>

  <h2>Épinglés <span id="pinned-counter"></span></h2>
  <div class="pinned-card" id="pinned-card"></div>

  <h2>Dossiers</h2>
  <div id="folders-container"></div>
  <button id="add-folder-btn" type="button">+ Nouveau dossier</button>

  <p id="save-status" aria-live="polite"></p>
`;

const pinnedCard = document.querySelector<HTMLDivElement>('#pinned-card')!;
const pinnedCounter = document.querySelector<HTMLSpanElement>('#pinned-counter')!;
const foldersContainer = document.querySelector<HTMLDivElement>('#folders-container')!;
const saveStatus = document.querySelector<HTMLParagraphElement>('#save-status')!;

function flashSaved(): void {
  saveStatus.textContent = 'Enregistré.';
  setTimeout(() => {
    saveStatus.textContent = '';
  }, 1500);
}

async function send(message: ExtensionMessage): Promise<unknown> {
  return browser.runtime.sendMessage(message);
}

async function loadOverview(): Promise<Overview> {
  return (await send({ type: 'get-overview' })) as Overview;
}

async function removeEntry(entryId: string): Promise<void> {
  await send({ type: 'remove-entry', entryId });
  await refresh();
}

function renderPinned(overview: Overview): void {
  pinnedCounter.textContent = `(${overview.pinnedCount}/${overview.maxPinned})`;
  pinnedCard.innerHTML = '';
  if (overview.pinned.length === 0) {
    pinnedCard.innerHTML = '<p class="hint">Aucun onglet épinglé — clic droit sur une page pour en ajouter un.</p>';
    return;
  }
  for (const entry of overview.pinned) {
    const row = document.createElement('div');
    row.className = 'pinned-row';

    const span = document.createElement('span');
    span.textContent = `${entry.isOpen ? '🟢' : '⚪'} ${entry.title}`;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'danger';
    removeBtn.type = 'button';
    removeBtn.textContent = 'Retirer';
    removeBtn.addEventListener('click', () => void removeEntry(entry.id));

    row.append(span, removeBtn);
    pinnedCard.append(row);
  }
}

function renderFolders(overview: Overview): void {
  foldersContainer.innerHTML = '';
  for (const folder of overview.folders) {
    const card = document.createElement('div');
    card.className = 'folder-card';

    const row = document.createElement('div');
    row.className = 'row';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = folder.name;
    nameInput.addEventListener('change', async () => {
      await send({ type: 'rename-folder', folderId: folder.id, name: nameInput.value });
      flashSaved();
    });

    const colorSelect = document.createElement('select');
    for (const color of GROUP_COLORS) {
      const option = document.createElement('option');
      option.value = color;
      option.textContent = color;
      option.selected = color === folder.color;
      colorSelect.append(option);
    }
    colorSelect.addEventListener('change', async () => {
      await send({ type: 'recolor-folder', folderId: folder.id, color: colorSelect.value });
      flashSaved();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'danger';
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Supprimer';
    deleteBtn.addEventListener('click', async () => {
      const count = folder.tabs.length;
      const ok = window.confirm(
        count > 0
          ? `Supprimer « ${folder.name} » retirera ${count} onglet(s) de la liste à garder (les onglets ouverts resteront ouverts, mais ne survivront plus à l'effacement de session). Continuer ?`
          : `Supprimer le dossier « ${folder.name} » ?`,
      );
      if (!ok) return;
      await send({ type: 'delete-folder', folderId: folder.id });
      await refresh();
    });

    row.append(nameInput, colorSelect, deleteBtn);

    const tabsList = document.createElement('div');
    tabsList.className = 'folder-tabs';
    tabsList.textContent =
      folder.tabs.length === 0 ? 'Aucun onglet dans ce dossier.' : folder.tabs.map((t) => t.title).join(' · ');

    card.append(row, tabsList);
    foldersContainer.append(card);
  }
}

async function refresh(): Promise<void> {
  const overview = await loadOverview();
  renderPinned(overview);
  renderFolders(overview);
}

document.querySelector<HTMLButtonElement>('#add-folder-btn')!.addEventListener('click', async () => {
  await send({ type: 'create-folder' });
  await refresh();
});

void refresh();
