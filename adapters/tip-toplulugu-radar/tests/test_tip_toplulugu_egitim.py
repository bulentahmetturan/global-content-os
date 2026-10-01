"""Tıp Topluluğu Eğitim lane registry + gate."""
from __future__ import annotations

import unittest

from radar.tip_toplulugu_activation import ACTIVATION_AUTOMATION_READY, ACTIVATION_MANUAL_INTAKE, compute_activation_state
from radar.tip_toplulugu_egitim import egitim_gate, is_egitim_source_id, load_egitim_pool, load_egitim_registry
from radar.tip_toplulugu_integrity import resolve_effective_registry, resolve_profile


class EgitimLaneTests(unittest.TestCase):
    def test_registry_ids_prefixed_and_merged(self):
        egitim = load_egitim_registry()
        ids = [s["source_id"] for s in egitim["sources"]]
        self.assertEqual(len(ids), 42)
        self.assertTrue(all(is_egitim_source_id(i) for i in ids))
        self.assertEqual(len(ids), len(set(ids)))
        eff = resolve_effective_registry()
        for sid in ids:
            p = resolve_profile(sid, eff)
            self.assertEqual(p["source_id"], sid)
            self.assertEqual(p.get("publication_eligible"), False)
            self.assertEqual(p.get("default_route_on_accept"), "EDUCATION")
            # 2026-09-30: only the production canary set is automated; the other 40 stay MANUAL_INTAKE
            expected = ACTIVATION_AUTOMATION_READY if sid in {"egitim_eso", "egitim_pasteur"} else ACTIVATION_MANUAL_INTAKE
            self.assertEqual(compute_activation_state(p), expected, sid)

    def test_pool_mirrors_registry(self):
        ids = {s["source_id"] for s in load_egitim_registry()["sources"]}
        pool_ids = {s["source_id"] for s in load_egitim_pool()["source_registry"]}
        self.assertEqual(ids, pool_ids)
        self.assertEqual(load_egitim_pool()["egitim_ilanlari"], [])

    def test_gate_accepts_named_observership(self):
        d, reason = egitim_gate("Cleveland Clinic named observership / preceptorship 2026")
        self.assertEqual(d, "ACCEPT")
        self.assertEqual(reason, "egitim_training_signal")

    def test_gate_discards_noise(self):
        d, reason = egitim_gate("USMLE Step 1 passing standard update")
        self.assertEqual(d, "DISCARD")
        self.assertEqual(reason, "no_egitim_signal")
        d2, r2 = egitim_gate("Garanti kabul ile ABD kurs paketi")
        self.assertEqual(d2, "DISCARD")
        self.assertEqual(r2, "egitim_discard_signal")

    def test_seed_includes_tour1_core(self):
        ids = {s["source_id"] for s in load_egitim_registry()["sources"]}
        for sid in (
            "egitim_ifm",
            "egitim_who_academy",
            "egitim_hms_ce",
            "egitim_mayo_scpd",
            "egitim_eso",
            "egitim_charite_im_summer",
            "egitim_wfot",
            "egitim_world_physio",
            "egitim_ifm_fmcp",
            "egitim_ifm_afmcp",
            "egitim_cleveland_observership",
            "egitim_uws_cnfm",
            "egitim_kresser_adapt",
            "egitim_fmca",
            "egitim_egfm",
            "egitim_nih_ippcr",
            "egitim_hms_hmx",
            "egitim_eso_medstudents",
            "egitim_esmo_students",
            "egitim_ucl_moorfields_oss",
            "egitim_erasmus_summer",
            "egitim_openwho",
        ):
            self.assertIn(sid, ids)


if __name__ == "__main__":
    unittest.main()
