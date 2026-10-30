import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from '../sqlite-d1.test-helper.mjs';

const S = await bundle('apps/worker/src/ingress/source-policy.ts', 'source-policy-hardening');
const verdict = (feed) => (t, orig) => S.sourcePolicyVerdict(feed, t, orig);

test('RAPS: device regulation and single-story regional items pass; roundups, fees, warning letters and deals stay out', () => {
  const v = verdict('news-raps-regulatory-focus-scoped');
  assert.equal(v('Asia-Pacific Roundup: Japan’s PMDA shares principles for evaluating generative AI-enabled medical devices'), 'pass');
  assert.equal(v('FDA’s device center releases guidance agenda for FY 2027'), 'pass');
  assert.equal(v('FDA draft guidance addresses considerations for robotically assisted surgical devices'), 'pass');
  assert.equal(v('Recon: FDA approves Edwards’ tricuspid valve repair device; Bayer wins Chinese approval for blood thinner'), 'deny');
  assert.equal(v('Asia-Pacific Roundup: TGA seeks feedback on temporary increase to Australia’s annual device charges'), 'deny');
  assert.equal(v('FDA warns Baxter, Olympus for GMP and QSR violations'), 'deny');
  assert.equal(v('This Week at FDA: Peptide dispute, clinical trial legislation, and more'), 'deny');
});

test('WHO Newsroom: guidelines, diagnostics, vaccines and outbreaks pass; nominations, partnerships, forums and climate stay out', () => {
  const v = verdict('news-who-newsroom-whole');
  assert.equal(v('WHO issues first global guidelines on child and adolescent obesity'), 'pass');
  assert.equal(v('WHO launches guidance on evidence generation for new TB diagnostics'), 'pass');
  assert.equal(v('Recommendations announced for influenza vaccine composition for the 2027 southern hemisphere influenza season'), 'pass');
  assert.equal(v('WHO reports latest global trends in cholera, meningitis and plague'), 'pass');
  assert.equal(v('Announcement of candidates for the position of WHO Director-General'), 'deny');
  assert.equal(v('Message by the Director of the Department of Immunization, Vaccines and Biologicals at WHO - October 2026'), 'deny');
  assert.equal(v('INTERPOL and WHO sign agreement to strengthen global health and security protection'), 'deny');
  assert.equal(v('Traditional medicine, resilience and well-being at World Health Summit 2026'), 'deny');
  assert.equal(v('Climate change is a growing health emergency, Lancet Countdown warns'), 'deny');
  assert.equal(v('WHO Youth Council welcomes 2026–2028 members in Berlin'), 'deny');
  assert.equal(v('IPC Sudan Food Insecurity and Malnutrition Alert'), 'deny');
});

test('MedPage Today: interest areas and public-health events pass; US politics, roundups, crime, personal and treatment-trial reports stay out', () => {
  const v = verdict('news-medpagetoday-sitemap');
  assert.equal(v('Obesity in Young Adults Linked to Multiple Early Cancers'), 'pass');
  assert.equal(v('Continuous Glucose Monitoring Beneficial in Type 2 Diabetes Not Treated With Insulin'), 'pass');
  assert.equal(v('Pennsylvania’s Measles Outbreak Is the Largest in Decades in the U.S.'), 'pass');
  assert.equal(v('Does Stool-Based Test Detect Colorectal Cancer as Well in Women?'), 'pass');
  assert.equal(v('Supplements and Liver Damage; New Skyrizi Approval in Crohn’s; Can C. Diff Be Prevented?'), 'deny');
  assert.equal(v('What Can Congress Do on Health Care After the Elections?'), 'deny');
  assert.equal(v('Death Penalty Sought in Murder Case of Mom Who Blamed Vaccines for Toddlers’ Deaths'), 'deny');
  assert.equal(v('Intensified Adjuvant Chemo No Better Than Standard in High-Risk Colon Cancer'), 'deny');
  assert.equal(v('Targeted Doublet Improves Survival in MET-Positive Progressive Lung Cancer'), 'deny');
  assert.equal(v('Quest Diagnostics Data Breach Notice on Patient Records'), 'deny');
  assert.equal(v('HHS Touts New Vaccine-Injury Initiatives'), 'deny');
});

test('FDA Press: approvals, clearances, guidance and device news pass; enforcement, tobacco, advisory calls and framework launches stay out', () => {
  const v = verdict('news-fda-press-scoped');
  assert.equal(v('FDA Approves First-of-Its-Kind Chronic Hepatitis B Treatment'), 'pass');
  assert.equal(v('FDA Issues Final Guidance on Prescription Drug Apps and Software'), 'pass');
  assert.equal(v('FDA Approves First Heart Valve Designed to Grow with Children'), 'pass');
  assert.equal(v('FDA Investigation Leads to Charges Against Two Indian Nationals Involved in Transnational Counterfeit Drug Distribution'), 'deny');
  assert.equal(v('Federal Court Enters Consent Decree Against Gold Star Distribution, Inc.'), 'deny');
  assert.equal(v('FDA intends to evaluate changes to the PMTA regulatory framework'), 'deny');
  assert.equal(v('FDA Launches Nationwide Effort to Expand Scientific Expertise and Consumer Voices to Advisory Committees'), 'deny');
  assert.equal(v('FDA Launches the Rare Disease Framework Initiative to Develop a Holistic, Fit-For-Purpose Framework for Rare Disease Drug Development'), 'deny');
});

test('NICE, EC medical devices and HealthAI: technology items pass; reports on events, minutes and MoUs stay out', () => {
  const nice = verdict('news-nice-healthtech-scoped');
  assert.equal(nice('New AI tools could help spot prostate cancer more accurately'), 'pass');
  assert.equal(nice('NICE recommends Enhertu for people with HER2-low advanced breast cancer'), 'deny');
  assert.equal(nice('NICE’s annual report and accounts 2025 to 2026'), 'deny');
  const ec = verdict('news-ec-medical-devices-target');
  assert.equal(ec('New revision of the MDCG Position Paper on the management of SS(C)P in Eudamed after mandatory use'), 'pass');
  assert.equal(ec('MDCG 2020-16 rev.5 - Guidance on Classification Rules for in vitro Diagnostic Medical Devices under Regulation (EU) 2017/746'), 'pass');
  assert.equal(ec('Minutes of the SoHO Coordination Board (SCB) 29 September 2026'), 'deny');
  assert.equal(ec('Registration for the State of Health in the EU launch webinar'), 'deny');
  const ai = verdict('news-healthai-news-whole');
  assert.equal(ai('HealthAI publishes framework for regulatory sandboxes in AI for health'), 'pass');
  assert.equal(ai('HealthAI Global Governance Forum 2026 | 18 November, London, UK'), 'deny');
  assert.equal(ai('HealthAI and TOPRA sign MoU'), 'deny');
  assert.equal(ai('HealthAI welcomes new Vice Chair of the Board'), 'deny');
});
