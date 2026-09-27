"""Hekimler Burs lane registry + gate."""
from __future__ import annotations

import unittest

from radar.hekimler_activation import ACTIVATION_MANUAL_INTAKE, compute_activation_state
from radar.hekimler_burs import burs_gate, is_burs_source_id, load_burs_pool, load_burs_registry
from radar.hekimler_integrity import resolve_effective_registry, resolve_profile


class BursLaneTests(unittest.TestCase):
    def test_registry_ids_prefixed_and_merged(self):
        burs = load_burs_registry()
        ids = [s["source_id"] for s in burs["sources"]]
        self.assertTrue(ids)
        self.assertTrue(all(is_burs_source_id(i) for i in ids))
        self.assertEqual(len(ids), len(set(ids)))
        eff = resolve_effective_registry()
        for sid in ids:
            p = resolve_profile(sid, eff)
            self.assertEqual(p["source_id"], sid)
            self.assertEqual(p.get("publication_eligible"), False)
            self.assertEqual(p.get("default_route_on_accept"), "OPPORTUNITY")
            self.assertEqual(compute_activation_state(p), ACTIVATION_MANUAL_INTAKE)

    def test_pool_mirrors_registry(self):
        burs_ids = {s["source_id"] for s in load_burs_registry()["sources"]}
        pool_ids = {s["source_id"] for s in load_burs_pool()["source_registry"]}
        self.assertEqual(burs_ids, pool_ids)
        self.assertEqual(load_burs_pool()["burs_ilanlari"], [])

    def test_gate_accepts_scholarship_signal(self):
        d, reason = burs_gate("Fulbright Yüksek Lisans Bursu başvuruları açıldı")
        self.assertEqual(d, "ACCEPT")
        self.assertEqual(reason, "burs_opportunity_signal")

    def test_gate_discards_noise(self):
        d, reason = burs_gate("USMLE Step 1 passing standard update")
        self.assertEqual(d, "DISCARD")
        self.assertEqual(reason, "no_burs_signal")
        d2, r2 = burs_gate("Garanti kabul ile ABD tıp bursu")
        self.assertEqual(d2, "DISCARD")
        self.assertEqual(r2, "burs_discard_signal")

    def test_seed_includes_requested_programmes(self):
        ids = {s["source_id"] for s in load_burs_registry()["sources"]}
        for sid in (
            "burs_tr_fulbright",
            "burs_tr_humphrey",
            "burs_tr_meb_ylsy",
            "burs_tr_tubitak_2214",
            "burs_tr_tubitak_2219",
            "burs_us_aauw_international",
            "burs_jp_mext",
            "burs_tr_kyk",
            "burs_hu_stipendium",
            "burs_tr_tubitak_2209",
            "burs_icm_congress",
            "burs_imperial_gozukara",
        ):
            self.assertIn(sid, ids)


if __name__ == "__main__":
    unittest.main()
