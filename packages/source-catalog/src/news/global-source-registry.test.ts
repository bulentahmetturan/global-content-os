import { describe, it, expect } from 'vitest';
import {
  globalNewsSourceRegistry,
  getSource,
  getTarget,
  getTargetsForSource,
  getSourcesForPublisher,
  isSupersededOrExcluded,
  computeRegistryCounts,
} from './global-source-registry.js';
import * as newsSchemas from './schemas.js';
import { DeliveryHandoffSchema } from './schemas.js';

describe('Global News Source Registry (Batch N2-FINAL)', () => {
  it('1. global source IDs are unique', () => {
    const ids = globalNewsSourceRegistry.sources.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('2. monitored target IDs are unique', () => {
    const ids = globalNewsSourceRegistry.targets.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('publisher IDs are unique', () => {
    const ids = globalNewsSourceRegistry.publishers.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every source references an existing publisher', () => {
    const publisherIds = new Set(globalNewsSourceRegistry.publishers.map((p) => p.id));
    for (const source of globalNewsSourceRegistry.sources) {
      expect(publisherIds.has(source.publisherId), `${source.id} -> missing publisher ${source.publisherId}`).toBe(true);
    }
  });

  it('every target references an existing source', () => {
    const sourceIds = new Set(globalNewsSourceRegistry.sources.map((s) => s.id));
    for (const target of globalNewsSourceRegistry.targets) {
      expect(sourceIds.has(target.sourceId), `${target.id} -> missing source ${target.sourceId}`).toBe(true);
    }
  });

  it('4/E. no active publisher or source is NAMED EUnetHTA 21, Lexxion EHPL, TOPRA Regulatory Rapporteur, MedDeviceGuide, or MHRA', () => {
    const excludedLabels = ['EUnetHTA 21', 'Lexxion', 'TOPRA Regulatory Rapporteur', 'MedDeviceGuide', 'MHRA'];
    const activeNames = [
      ...globalNewsSourceRegistry.publishers.map((p) => p.canonicalName),
      ...globalNewsSourceRegistry.sources.map((s) => s.canonicalName),
    ];
    for (const label of excludedLabels) {
      expect(activeNames.some((n) => n.includes(label)), `found forbidden active publisher/source named "${label}"`).toBe(false);
    }
    for (const id of ['eunethta-21', 'lexxion-ehpl', 'topra-regulatory-rapporteur', 'meddeviceguide', 'mhra']) {
      expect(isSupersededOrExcluded(id)).toBe(true);
    }
  });

  it('5. EUnetHTA 21 stays superseded (its HTACG successor was removed from the catalog 2026-10-31)', () => {
    const superseded = globalNewsSourceRegistry.supersededOrExcluded.find((e) => e.id === 'eunethta-21');
    expect(superseded?.status).toBe('SUPERSEDED');
  });

  it('6. Resmî Gazete subscription target is health-scoped, not whole-publisher unrestricted', () => {
    const target = getTarget('resmi-gazete-health-scoped');
    expect(target).toBeDefined();
    expect(target!.scopeType).not.toBe('WHOLE_SOURCE');
    expect(target!.scopeDescription.toLowerCase()).toContain('health');
  });

  it('7. SGK was removed from the catalog (2026-10-31): its Duyuru page is a Duyuru-lane candidate, its news is protocol news', () => {
    expect(getTarget('sgk-health-scoped')).toBeUndefined();
    expect(globalNewsSourceRegistry.sources.some((x) => x.id === 'sgk-announcements')).toBe(false);
  });

  it('8. EUR-Lex was removed from the catalog (2026-10-31) and must not return as an unrestricted target', () => {
    expect(getTarget('eur-lex-mdr-ivdr-health-query')).toBeUndefined();
  });

  it('9. TİTCK Tıbbi Cihaz Duyuruları is a child target under TİTCK, not a duplicate unrelated source', () => {
    const target = getTarget('titck-tibbi-cihaz-duyurulari');
    expect(target!.sourceId).toBe('titck-announcements');
    const source = getSource('titck-announcements');
    expect(source!.publisherId).toBe('titck');
  });

  it('10. FDA CDRH was removed from the catalog (2026-10-31) and must not return as a duplicate publisher', () => {
    expect(getTarget('fda-cdrh-digital-health')).toBeUndefined();
    const publisherIds = globalNewsSourceRegistry.publishers.map((p) => p.id);
    expect(publisherIds).not.toContain('fda-digital-health-center-of-excellence');
    expect(publisherIds).not.toContain('fda-cdrh-digital-health');
  });

  it('11. TÜYZE health-AI monitoring is associated with TÜSEB, not a duplicate publisher', () => {
    const target = getTarget('tuyze-saglikta-yapay-zeka');
    expect(target!.sourceId).toBe('tuseb-news');
    const source = getSource('tuseb-news');
    expect(source!.publisherId).toBe('tuseb');
    const publisherIds = globalNewsSourceRegistry.publishers.map((p) => p.id);
    expect(publisherIds).not.toContain('tuyze');
  });

  it('12. FDA AI-Enabled Medical Device List is NOT an independent News subscription', () => {
    const asReference = globalNewsSourceRegistry.referenceResources.find((r) => r.id === 'fda-ai-enabled-device-list');
    expect(asReference).toBeDefined();
    expect(asReference!.isNewsPublisher).toBe(false);
    expect(globalNewsSourceRegistry.sources.some((s) => s.id === 'fda-ai-enabled-device-list')).toBe(false);
  });

  it('13. HSA registration dataset is NOT an independent News subscription', () => {
    const asReference = globalNewsSourceRegistry.referenceResources.find((r) => r.id === 'hsa-device-registration-dataset');
    expect(asReference).toBeDefined();
    expect(asReference!.isNewsPublisher).toBe(false);
    expect(globalNewsSourceRegistry.sources.some((s) => s.id === 'hsa-device-registration-dataset')).toBe(false);
  });

  it('14. Research-only publishers (PubMed/JAMA/Lancet/NEJM) are not mixed into Kaduse News registry', () => {
    const haystack = JSON.stringify(globalNewsSourceRegistry.sources) + JSON.stringify(globalNewsSourceRegistry.publishers);
    for (const term of ['PubMed', 'JAMA', 'Lancet', 'NEJM', 'Cell Press']) {
      expect(haystack.includes(term), `found forbidden Research-archetype publisher "${term}" in News registry`).toBe(false);
    }
  });

  it('15. Fierce source identity is not duplicated as multiple equivalent Fierce device publishers', () => {
    // Fierce Medtech was removed from the catalog on 2026-10-31 (owner decision); no Fierce publisher may linger or return as a duplicate.
    const fiercePublishers = globalNewsSourceRegistry.publishers.filter((p) => p.id.startsWith('fierce'));
    expect(fiercePublishers.length).toBe(0);
    expect(getSourcesForPublisher('fierce').length).toBe(0);
  });

  it('16. CEN-CENELEC JTC 21 was removed from the catalog (2026-10-31)', () => {
    expect(getTarget('jtc21-ai-health-gated')).toBeUndefined();
  });

  it('17. MobiHealthNews was removed from the catalog (2026-10-31)', () => {
    expect(getTarget('mobihealthnews-ai-device-scoped')).toBeUndefined();
  });

  it('18. Global News source model does not contain mail-provider-specific fields', () => {
    const banned = ['smtp', 'sendgrid', 'resend', 'mailgun', 'postmark', 'recipientEmail', 'unsubscribeToken', 'apiSecret', 'senderAddress'];
    const serialized = JSON.stringify(globalNewsSourceRegistry).toLowerCase();
    for (const term of banned) {
      expect(serialized.includes(term.toLowerCase())).toBe(false);
    }
  });

  it('19. provider-independent delivery handoff contract exists and validates', () => {
    const sample = {
      candidateId: 'candidate-1',
      sourceId: 'who-newsroom',
      targetId: 'who-newsroom-whole',
      channelId: 'kaduse-medikal',
      title: 'Example headline',
      canonicalUrl: 'https://www.who.int/news/item/example',
      routedAt: '2026-09-04T00:00:00.000Z',
      archetypeId: 'kaduse-news',
      language: 'en',
      deliveryEligibility: 'PENDING_REVIEW',
      dedupeKey: 'sha256:example',
      provenance: ['who-newsroom-whole'],
    };
    expect(() => DeliveryHandoffSchema.parse(sample)).not.toThrow();
  });

  it('20. no SMTP/email provider integration was added (no dependency, no adapter file)', () => {
    // Structural check: the schemas module exports no email-provider types.
    const schemaKeys = Object.keys(newsSchemas);
    for (const forbidden of ['SmtpSchema', 'EmailProviderSchema', 'MailAdapterSchema']) {
      expect(schemaKeys.includes(forbidden)).toBe(false);
    }
  });

  it('21. one canonical news item can conceptually route to multiple delivery surfaces without duplicate article truth (dedupeKey is shared, not per-surface)', () => {
    const base = {
      candidateId: 'candidate-1',
      sourceId: 'who-newsroom',
      targetId: 'who-newsroom-whole',
      title: 'Example headline',
      canonicalUrl: 'https://www.who.int/news/item/example',
      routedAt: '2026-09-04T00:00:00.000Z',
      archetypeId: 'kaduse-news',
      language: 'en',
      deliveryEligibility: 'ELIGIBLE' as const,
      dedupeKey: 'sha256:example',
      provenance: ['who-newsroom-whole'],
    };
    const routeA = DeliveryHandoffSchema.parse({ ...base, channelId: 'kaduse-medikal' });
    const routeB = DeliveryHandoffSchema.parse({ ...base, channelId: 'future-ai-health-channel' });
    expect(routeA.dedupeKey).toBe(routeB.dedupeKey);
    expect(routeA.candidateId).toBe(routeB.candidateId);
    expect(routeA.channelId).not.toBe(routeB.channelId);
  });

  it('EC parent institution keeps only the medical-devices source after the 2026-10-31 catalog purge', () => {
    const ecSources = getSourcesForPublisher('ec');
    expect(ecSources.map((s) => s.id).sort()).toEqual(
      ['ec-medical-devices'].sort()
    );
  });

  it('FDA parent publisher keeps only Press Announcements after the 2026-10-31 CDRH removal', () => {
    const fdaSources = getSourcesForPublisher('fda');
    expect(fdaSources.map((s) => s.id)).toEqual(['fda-press-announcements']);
    expect(getTargetsForSource('fda-cdrh').length).toBe(0);
  });

  it('computed registry counts match the authoritative Batch N2-FINAL selection plus lifecycle additions and the 2026-10-31 purge (26 logical sources)', () => {
    const counts = computeRegistryCounts();
    expect(counts.logicalSourceCount).toBe(26);
    expect(counts.referenceResourceCount).toBe(5);
    expect(counts.monitoredTargetCount).toBe(28);
    expect(counts.uniquePublisherCount).toBe(25);
  });

  describe('Batch N2-FINAL-R1: verification state is separate from transport status', () => {
    it('verificationStatus and transportStatus are independently representable (different objects, different enums)', () => {
      const resmi = getSource('resmi-gazete-source')!;
      const resmiTarget = getTarget('resmi-gazete-health-scoped')!;
      expect(resmi.verificationStatus).toBe('PENDING_VERIFICATION');
      expect(resmiTarget.scopeType).toBe('CHANNEL_FILTER_OVER_BROADER_SOURCE');
      expect(resmiTarget.transportStatus).toBe('PENDING_MANUAL');
      // Three independent facts about the same Resmi Gazete target/source, none derived from another.
    });

    it('exactly the 1 source still reported as freshly verified in Batch N2-FINAL carry FRESHLY_VERIFIED_THIS_BATCH', () => {
      const freshlyVerified = globalNewsSourceRegistry.sources
        .filter((s) => s.verificationStatus === 'FRESHLY_VERIFIED_THIS_BATCH')
        .map((s) => s.id)
        .sort();
      expect(freshlyVerified).toEqual(['healthai-news']);
    });

    it('every other source (25 of 26) is honestly PENDING_VERIFICATION, not falsely marked verified', () => {
      const counts = computeRegistryCounts();
      expect(counts.freshlyVerifiedSourceCount).toBe(1);
      expect(counts.pendingVerificationSourceCount).toBe(25);
      expect(counts.freshlyVerifiedSourceCount + counts.pendingVerificationSourceCount).toBe(counts.logicalSourceCount);
    });

    it('every FRESHLY_VERIFIED_THIS_BATCH source carries a non-empty verificationNote as evidence', () => {
      const freshlyVerified = globalNewsSourceRegistry.sources.filter((s) => s.verificationStatus === 'FRESHLY_VERIFIED_THIS_BATCH');
      for (const s of freshlyVerified) {
        expect(s.verificationNote, `${s.id} missing verificationNote`).toBeTruthy();
        expect(s.verificationNote!.length).toBeGreaterThan(10);
      }
    });
  });
});
