// Cross-repo integration/contract test (Batch N2-FINAL-R1). This is the ONLY
// test in this repo that reaches across the repository boundary, and it does
// so in the correct direction: this repo OWNS the global source truth, so it
// validates a consumer's config against itself -- multi_channel_design never
// needs this repo present to run its own normal tests (see that repo's
// news-source-subscriptions.test.mjs, which is fully local).
//
// Every test below is skipped (not failed) when the multi_channel_design
// sibling checkout is absent, so `vitest run` in THIS repo also stays
// runnable standalone -- this file documents the explicit integration
// boundary, it does not become a silent hard dependency either direction.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  globalNewsSourceRegistry,
  getSource,
  getTarget,
} from './global-source-registry.js';

// vitest's cwd here is mcp-server/ (this package root) -- two hops up
// reaches the shared "projects" parent that holds both sibling repos.
const siblingRoot = path.resolve(process.cwd(), '..', 'multi_channel_design');
const kaduseNewsSourcesPath = path.join(siblingRoot, 'channels/kaduse-medikal/content/news-sources.json');
const siblingAvailable = existsSync(kaduseNewsSourcesPath);

type KaduseSubscription = { channelId: string; sourceId: string; targetId: string; enabled: boolean; inclusionPolicy?: string[]; exclusionPolicy?: string[] };
type KaduseNewsSources = {
  subscriptions: KaduseSubscription[];
  subscriptionCount: number;
  supersededOrExcluded: { excludedOrSuperseded: string[] };
};

// Guarded with a plain `if`, not describe.skipIf: skipIf still eagerly
// executes the block body during test collection, so reading a nonexistent
// sibling file would crash the whole file regardless of "skip" (found and
// fixed alongside the equivalent observance contract test, Batch O1). Only
// register the suite at all when the sibling is present.
if (siblingAvailable) {
  describe('Kaduse subscription contract (requires multi_channel_design sibling checkout)', () => {
    const kaduseNews: KaduseNewsSources = JSON.parse(readFileSync(kaduseNewsSourcesPath, 'utf-8'));
    const sourceIds = new Set(globalNewsSourceRegistry.sources.map((s) => s.id));
    const targetIds = new Set(globalNewsSourceRegistry.targets.map((t) => t.id));

    it('every Kaduse subscription resolves to an existing global source and target', () => {
      for (const sub of kaduseNews.subscriptions) {
        expect(sourceIds.has(sub.sourceId), `unknown sourceId ${sub.sourceId}`).toBe(true);
        expect(targetIds.has(sub.targetId), `unknown targetId ${sub.targetId}`).toBe(true);
      }
    });

    it('every subscription target actually belongs to its declared source', () => {
      for (const sub of kaduseNews.subscriptions) {
        const target = getTarget(sub.targetId)!;
        expect(target.sourceId).toBe(sub.sourceId);
      }
    });

    it('Kaduse has exactly 59 subscriptions, matching the registry\'s 59 monitored targets', () => {
      expect(kaduseNews.subscriptions.length).toBe(59);
      expect(kaduseNews.subscriptions.length).toBe(globalNewsSourceRegistry.targets.length);
    });

    it('excluded/superseded identities recorded channel-side match the global registry exactly', () => {
      const globalExcludedIds = new Set(globalNewsSourceRegistry.supersededOrExcluded.map((e) => e.id));
      for (const id of kaduseNews.supersededOrExcluded.excludedOrSuperseded) {
        expect(globalExcludedIds.has(id), `${id} not present in global supersededOrExcluded`).toBe(true);
      }
      expect(kaduseNews.supersededOrExcluded.excludedOrSuperseded.length).toBe(globalNewsSourceRegistry.supersededOrExcluded.length);
    });

    it('mapping a) Resmi Gazete -> Kaduse health-only subscription', () => {
      const sub = kaduseNews.subscriptions.find((s) => s.targetId === 'resmi-gazete-health-scoped');
      expect(sub).toBeDefined();
      expect(sub!.sourceId).toBe('resmi-gazete-source');
      const target = getTarget(sub!.targetId)!;
      expect(target.scopeType).toBe('CHANNEL_FILTER_OVER_BROADER_SOURCE');
    });

    it('mapping b) FDA CDRH -> Kaduse AI/device monitored targets (4 targets, all under fda-cdrh)', () => {
      const cdrhSubs = kaduseNews.subscriptions.filter((s) => s.sourceId === 'fda-cdrh');
      expect(cdrhSubs.length).toBe(4);
      for (const sub of cdrhSubs) {
        expect(getSource(sub.sourceId)!.publisherId).toBe('fda');
      }
    });

    it('mapping c) TUSEB -> TUYZE -> Kaduse Saglikta Yapay Zeka subscription', () => {
      const sub = kaduseNews.subscriptions.find((s) => s.targetId === 'tuyze-saglikta-yapay-zeka');
      expect(sub).toBeDefined();
      expect(sub!.sourceId).toBe('tuseb-news');
      expect(getSource(sub!.sourceId)!.publisherId).toBe('tuseb');
    });
  });
} else {
  describe('Kaduse subscription contract', () => {
    it('skipped -- multi_channel_design sibling checkout not present', () => {
      expect(siblingAvailable).toBe(false);
    });
  });
}
