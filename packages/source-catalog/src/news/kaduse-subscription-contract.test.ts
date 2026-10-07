// Kaduse subscription contract. Subscriptions are CANONICAL in this repo
// (data/kaduse-subscriptions.json, Package 2); the test is fully local -- no
// sibling checkout is read. It proves every subscription resolves against the
// news registry that sits beside it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { globalNewsSourceRegistry, getSource, getTarget } from './global-source-registry.js';

type KaduseSubscription = {
  channelId: string;
  sourceId: string;
  targetId: string;
  enabled: boolean;
  inclusionPolicy?: string[];
  exclusionPolicy?: string[];
};
type KaduseSubscriptions = { channelId: string; subscriptionCount: number; subscriptions: KaduseSubscription[] };

const dataPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../data/kaduse-subscriptions.json'
);
const kaduseNews: KaduseSubscriptions = JSON.parse(readFileSync(dataPath, 'utf-8'));

describe('Kaduse subscription contract (canonical local data)', () => {
  it('every Kaduse subscription resolves to an existing global source and target', () => {
    const sourceIds = new Set(globalNewsSourceRegistry.sources.map((s) => s.id));
    const targetIds = new Set(globalNewsSourceRegistry.targets.map((t) => t.id));
    for (const sub of kaduseNews.subscriptions) {
      expect(sourceIds.has(sub.sourceId), `unknown sourceId ${sub.sourceId}`).toBe(true);
      expect(targetIds.has(sub.targetId), `unknown targetId ${sub.targetId}`).toBe(true);
    }
  });

  it('every subscription target actually belongs to its declared source', () => {
    for (const sub of kaduseNews.subscriptions) {
      expect(getTarget(sub.targetId)!.sourceId).toBe(sub.sourceId);
    }
  });

  it("Kaduse has exactly 61 subscriptions, matching the registry's 61 monitored targets, each once", () => {
    expect(kaduseNews.subscriptions.length).toBe(61);
    expect(kaduseNews.subscriptionCount).toBe(kaduseNews.subscriptions.length);
    expect(kaduseNews.subscriptions.length).toBe(globalNewsSourceRegistry.targets.length);
    expect(new Set(kaduseNews.subscriptions.map((s) => s.targetId)).size).toBe(61);
    for (const sub of kaduseNews.subscriptions) expect(sub.channelId).toBe('kaduse-medikal');
  });

  it('mapping a) Resmi Gazete -> Kaduse health-only subscription', () => {
    const sub = kaduseNews.subscriptions.find((s) => s.targetId === 'resmi-gazete-health-scoped');
    expect(sub).toBeDefined();
    expect(sub!.sourceId).toBe('resmi-gazete-source');
    expect(getTarget(sub!.targetId)!.scopeType).toBe('CHANNEL_FILTER_OVER_BROADER_SOURCE');
  });

  it('mapping b) FDA CDRH -> Kaduse AI/device monitored targets (4 targets, all under fda-cdrh)', () => {
    const cdrhSubs = kaduseNews.subscriptions.filter((s) => s.sourceId === 'fda-cdrh');
    expect(cdrhSubs.length).toBe(4);
    for (const sub of cdrhSubs) expect(getSource(sub.sourceId)!.publisherId).toBe('fda');
  });

  it('mapping c) TUSEB -> TUYZE -> Kaduse Saglikta Yapay Zeka subscription', () => {
    const sub = kaduseNews.subscriptions.find((s) => s.targetId === 'tuyze-saglikta-yapay-zeka');
    expect(sub).toBeDefined();
    expect(sub!.sourceId).toBe('tuseb-news');
    expect(getSource(sub!.sourceId)!.publisherId).toBe('tuseb');
  });
});
