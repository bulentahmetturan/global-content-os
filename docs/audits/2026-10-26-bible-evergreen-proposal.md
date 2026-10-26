# Bible change proposal: Evergreen (owner decision 2026-10-26)

Owner: "Evergreenler haber değil. Haber ve duyurular time sensitive. Evergreen başlığı başka bir başlık."

## Finding
Bible v4 §2 allows exactly five primary categories (Haber, Burs, Eğitim, Duyuru, Research) and forbids opening new ones without a change (§2, §28.3). The Hub already treats Sağlık & Referans (evergreen_view = health_reference, acquisition path EVERGREEN, 88 open items, Cleveland Clinic) and Research Rediscovery as separate headings. They are outside the Bible's category list; today they are stored in the Haber route (`kaduse-news`) only because of storage, not meaning.

## Decision
- Evergreen is its own heading, not a Haber sub-type. Haber and Duyuru are time-sensitive (expire); evergreen content is not time-sensitive (no staleness expiry, reviewed by relevance instead).
- Item counts and gates must therefore stop treating evergreen items as Haber: the Haber freshness gate (10 days) never applies to them.

## Proposed Bible amendment (needs owner wording approval before editing the canonical file)
1. §2: add a time-sensitivity axis. Time-sensitive categories: Haber, Duyuru, Burs, Eğitim (deadline-based), Research (recency-based). Evergreen reference content: new primary category `referans` (Sağlık & Referans), explicitly not time-sensitive.
2. §11.1 category list and §22 vocabulary: add `referans`; §20.1 lifecycle: evergreen items skip staleness, use periodic relevance review.
3. SPF: add SPF-8b Referans PASS/FAIL (accuracy, authoritative publisher, patient-safe language, medical-evidence gate §13 when claims are made; Turkey eligibility N/A; engagement optional).
4. Process per §28.3: bump Bible to v4.1, write changelog, update validator/tests and `controlled-vocabulary.json`, decide migration (none expected: `evergreen_view` already exists), run the regression suite, regenerate Hub copies with `node scripts/generate-hub-assets.mjs`.

## Not done yet
No Bible, config or code change made. Next: owner approves wording, then the amendment is applied through the canonical file in `adapters/tip-toplulugu-radar/content/`.
