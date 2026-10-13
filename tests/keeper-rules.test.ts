import { describe, it, expect } from 'vitest';
import { planReconciliation, type KeepEntry } from '@/lib/keeper-rules';

function entry(overrides: Partial<KeepEntry> = {}): KeepEntry {
  return { id: 'e1', url: 'https://example.com', pinned: true, ...overrides };
}

describe('planReconciliation', () => {
  it('ferme tout onglet non protégé', () => {
    const plan = planReconciliation([], {}, new Set([1, 2, 3]));
    expect(plan.toClose.sort()).toEqual([1, 2, 3]);
    expect(plan.toOpen).toEqual([]);
  });

  it('protège un onglet dont l’entrée est mappée et toujours ouverte', () => {
    const entries = [entry({ id: 'pinned-1' })];
    const plan = planReconciliation(entries, { 'pinned-1': 10 }, new Set([10, 99]));
    expect(plan.toClose).toEqual([99]);
    expect(plan.toOpen).toEqual([]);
  });

  it('protège un onglet même après navigation — aucune comparaison d’URL, seul le mapping compte', () => {
    // L'entrée a une URL "home" différente de l'onglet réel : ça ne doit rien changer.
    const entries = [entry({ id: 'pinned-1', url: 'https://mail.google.com/mail/u/0' })];
    const plan = planReconciliation(entries, { 'pinned-1': 10 }, new Set([10]));
    expect(plan.toClose).toEqual([]);
    expect(plan.toOpen).toEqual([]);
  });

  it('prévoit de rouvrir une entrée dont le tabId mappé a disparu', () => {
    const entries = [entry({ id: 'pinned-1' })];
    const plan = planReconciliation(entries, { 'pinned-1': 10 }, new Set([99])); // 10 n'est plus ouvert
    expect(plan.toOpen).toEqual([entries[0]]);
    expect(plan.toClose).toEqual([99]);
  });

  it('prévoit de rouvrir une entrée jamais encore ouverte (aucun mapping)', () => {
    const entries = [entry({ id: 'kept-1', pinned: false, folderId: 'f1' })];
    const plan = planReconciliation(entries, {}, new Set());
    expect(plan.toOpen).toEqual(entries);
    expect(plan.toClose).toEqual([]);
  });

  it('gère plusieurs entrées et onglets mixtes', () => {
    const entries = [entry({ id: 'a' }), entry({ id: 'b', pinned: false, folderId: 'f1' })];
    const mapping = { a: 1 }; // b jamais ouvert
    const plan = planReconciliation(entries, mapping, new Set([1, 2, 3]));
    expect(plan.toClose.sort()).toEqual([2, 3]);
    expect(plan.toOpen).toEqual([entries[1]]);
  });
});
