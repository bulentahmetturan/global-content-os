// Test-only fictional world for the local end-to-end run. Every topic, supplement, technology and person below is INVENTED for
// the fixtures; none is a real concept, none is seeded anywhere, and the runtime code contains no list of any of them.
// (Names are chosen to match nothing in the product brief.)
export const LABELS = {
  health: 'Velmora syndrome',
  protocol: 'Quenti protocol',
  supplement: 'Ostrel complex',
  supplementForm: 'Ostrel citrate-form',
  tech: 'Thrimex assay platform',
  phAnchored: 'Drevan particulate exposure',
  phSocialOnly: 'Zelmar ambient hazard',
};

const content = (value, mentions, extra = {}, fixture = {}) => ({ acquisitionSourceId: 'x', platform: null, identity: { strategy: 'SOURCE_PLUS_EXTERNAL_ITEM_ID', value }, title: `Fictional item ${value}`, publishedAt: '2026-10-02', fixture: { extraction: { mentions, jointGroups: [] }, ...fixture }, ...extra });
const m = (label, domainHint, span) => ({ label, domainHint, evidenceSpan: span ?? `excerpt about ${label}` });
const demand = (label, domainHint, family = 'TURKEY_PUBLIC_DEMAND', kind = 'SEARCH_VELOCITY') => ({ conceptLabel: label, domainHint, observationKind: kind, signalFamily: family, measurementProvenance: 'SEARCH', observedAt: '2026-10-02T00:00:00Z', valueStatus: 'UNKNOWN' });

/** createMockConnector / classifier builders are passed in so this file stays free of imports. */
export function buildWorld({ createMockConnector, createFixtureClassifier }, actorIds) {
  const [a1, a2] = actorIds;
  const edu = { contentClass: 'HEALTH_EDUCATIONAL', commercialContext: 'NONE', clinicianReportedPublicQuestion: false };
  const table = {};
  const classify = (id, c = edu) => { table[id] = c; };

  const rss = [
    content('h-rss', [m(LABELS.health, 'HEALTH')], {}, { actorId: a1 }),
    content('pair-1', [m(LABELS.supplement, 'SUPPLEMENT'), m(LABELS.health, 'HEALTH')], {}, { actorId: a1 }),
    content('triple-1', [m(LABELS.health, 'HEALTH'), m(LABELS.protocol, 'NUTRITION_PROTOCOL'), m(LABELS.supplement, 'SUPPLEMENT')], {}, { actorId: a1 }),
  ];
  rss[1].fixture.extraction.jointGroups = [{ labels: [LABELS.supplement, LABELS.health], kind: 'JOINT_SOURCE_MENTION' }];
  rss[2].fixture.extraction.jointGroups = [{ labels: [LABELS.health, LABELS.protocol, LABELS.supplement], kind: 'TITLE_OR_CAPTION_CO_OCCURRENCE', direct: true }];
  const pod = [content('h-pod', [m(LABELS.health, 'HEALTH')], {}, { actorId: a2 }), content('pair-2', [m(LABELS.supplement, 'SUPPLEMENT'), m(LABELS.health, 'HEALTH')], {}, { actorId: a2 })];
  pod[1].fixture.extraction.jointGroups = [{ labels: [LABELS.supplement, LABELS.health], kind: 'JOINT_SOURCE_MENTION' }];
  const yt = [content('h-yt', [m(LABELS.health, 'HEALTH')], {}, { actorId: a1 }), content('q-yt', [m(LABELS.protocol, 'NUTRITION_PROTOCOL')], {}, { actorId: a1 })];
  const ig = [
    content('c-own', [m(LABELS.supplement, 'SUPPLEMENT')], {}, { actorId: a2 }),
    content('c-aff', [m(LABELS.supplement, 'SUPPLEMENT')], {}, { actorId: a2 }),
    content('c-spons', [m(LABELS.supplement, 'SUPPLEMENT')], {}, { actorId: a2 }),
    content('c-neutral', [m(LABELS.supplementForm, 'SUPPLEMENT')], {}, { actorId: a2 }),
    content('p-personal', [m('Personal Trip Fiction', 'HEALTH')], {}, { actorId: a2 }),
  ];
  const tt = [
    content('ph-tt-1', [m(LABELS.phAnchored, 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH'), m(LABELS.phSocialOnly, 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH')], {}, { actorId: a1, signalFamily: 'TURKEY_SOCIAL_MOMENTUM' }),
    content('ph-tt-2', [m(LABELS.phAnchored, 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH'), m(LABELS.phSocialOnly, 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH')], {}, { actorId: a2, signalFamily: 'TURKEY_SOCIAL_MOMENTUM' }),
    content('ph-tt-3', [m(LABELS.phSocialOnly, 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH')], {}, { actorId: a1, signalFamily: 'TURKEY_SOCIAL_MOMENTUM' }),
  ];
  for (const it of [...rss, ...pod, ...yt, ...tt]) classify(it.identity.value);
  classify('c-own', { contentClass: 'OWN_PRODUCT', commercialContext: 'OWN_PRODUCT', clinicianReportedPublicQuestion: false });
  classify('c-aff', { contentClass: 'AFFILIATE', commercialContext: 'AFFILIATE', clinicianReportedPublicQuestion: false });
  classify('c-spons', { contentClass: 'SPONSORED', commercialContext: 'SPONSORED', clinicianReportedPublicQuestion: false });
  classify('c-neutral');
  classify('p-personal', { contentClass: 'PERSONAL', commercialContext: 'NONE', clinicianReportedPublicQuestion: false });
  classify('q-yt', { contentClass: 'PATIENT_QUESTION', commercialContext: 'NONE', clinicianReportedPublicQuestion: true });

  const dataItem = (value, strategy, signals) => ({ acquisitionSourceId: 'x', platform: null, identity: { strategy, value }, title: `Fictional release ${value}`, publishedAt: '2026-10-02', signals });
  const readers = [
    createMockConnector({ id: 'rss-a', class: 'RSS_WEB', acquisitionSourceId: 'src-rss', items: rss }),
    createMockConnector({ id: 'pod-a', class: 'PODCAST_RSS', acquisitionSourceId: 'src-pod', items: pod }),
    createMockConnector({ id: 'yt-a', class: 'YOUTUBE_CHANNEL', acquisitionSourceId: 'src-yt', items: yt }),
    createMockConnector({ id: 'ig-a', platformMode: 'INSTAGRAM_MANUAL_SNAPSHOT', acquisitionSourceId: 'src-ig', items: ig }),
    createMockConnector({ id: 'tt-a', platformMode: 'TIKTOK_AUTHORIZED_PROVIDER', acquisitionSourceId: 'src-tt', items: tt }),
    createMockConnector({ id: 'demand-a', class: 'PUBLIC_DEMAND', acquisitionSourceId: 'src-demand', items: [dataItem('demand-2026-10', 'NORMALIZED_PROVIDER_KEY', [demand(LABELS.health, 'HEALTH'), demand(LABELS.phSocialOnly, 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH'), demand(LABELS.phAnchored, 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH')])] }),
    createMockConnector({ id: 'csi-a', platformMode: 'TIKTOK_CSI_MANUAL', acquisitionSourceId: 'src-csi', items: [dataItem('csi-snap-1', 'MANUAL_SNAPSHOT_KEY', [demand(LABELS.protocol, 'NUTRITION_PROTOCOL', 'TURKEY_PUBLIC_DEMAND', 'SEARCH_MAGNITUDE')])] }),
    createMockConnector({ id: 'trials-a', class: 'TRIAL_METADATA', acquisitionSourceId: 'src-trials', items: [dataItem('trials-2026-10', 'DATASET_RELEASE_KEY', [{ conceptLabel: LABELS.tech, domainHint: 'LONGEVITY_TECHNOLOGY', observationKind: 'RESEARCH_ACTIVITY_COUNT', signalFamily: 'GLOBAL_RESEARCH_ACTIVITY', measurementProvenance: 'ADMINISTRATIVE', observedAt: '2026-10-02T00:00:00Z', valueStatus: 'UNKNOWN' }])] }),
    createMockConnector({ id: 'geo-a', class: 'GEO_OBSERVATION', acquisitionSourceId: 'src-geo', items: [dataItem('geo-2025', 'DATASET_RELEASE_KEY', [{ conceptLabel: LABELS.phAnchored, domainHint: 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH', observationKind: 'ENVIRONMENTAL_MEASURED', signalFamily: 'ENVIRONMENTAL_MEASUREMENT', measurementProvenance: 'MEASURED', observedAt: '2026-03-01T00:00:00Z', windowKind: 'SOURCE_PERIOD', windowStart: '2025-01-01', windowEnd: '2025-12-31', geoScope: 'TR-34', value: 21, valueUnit: 'ug_m3', valueStatus: 'MEASURED' }])] }),
    createMockConnector({ id: 'surv-a', class: 'SURVEILLANCE_RELEASE', acquisitionSourceId: 'src-surv', items: [dataItem('surv-2025', 'DATASET_RELEASE_KEY', [{ conceptLabel: LABELS.phAnchored, domainHint: 'POPULATION_ENVIRONMENTAL_PUBLIC_HEALTH', observationKind: 'ADMINISTRATIVE_STATISTIC', signalFamily: 'TURKEY_PUBLIC_HEALTH_DATA', measurementProvenance: 'ADMINISTRATIVE', observedAt: '2026-03-01T00:00:00Z', windowKind: 'RELEASE_PERIOD', windowStart: '2025-01-01', windowEnd: '2025-12-31', geoScope: 'TR', value: 3.2, valueUnit: 'per_1000', valueStatus: 'MEASURED' }])] }),
  ];
  return { readers, classifier: createFixtureClassifier(table) };
}
