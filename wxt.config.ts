import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Ankyronauta',
    description:
      "Onglets épinglés (max 9) et dossiers d'onglets à garder façon Arc ; les autres onglets sont effacés entre chaque session (fermeture définitive, sans récupération).",
    permissions: ['tabs', 'tabGroups', 'storage', 'contextMenus'],
  },
});
