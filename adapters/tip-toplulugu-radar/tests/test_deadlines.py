from __future__ import annotations

import unittest
from datetime import date

from radar.deadlines import (
    days_until,
    deadline_risk_flag,
    deadline_urgency_boost,
    parse_tr_date,
)


class DeadlineTests(unittest.TestCase):
    def test_parse_dotted_date(self):
        self.assertEqual(parse_tr_date("21.09.2026"), date(2026, 9, 21))

    def test_parse_slash_date(self):
        self.assertEqual(parse_tr_date("21/09/2026"), date(2026, 9, 21))

    def test_parse_iso_date(self):
        self.assertEqual(parse_tr_date("2026-09-21"), date(2026, 9, 21))

    def test_parse_two_digit_year(self):
        self.assertEqual(parse_tr_date("21.09.26"), date(2026, 9, 21))

    def test_parse_none_and_garbage(self):
        self.assertIsNone(parse_tr_date(None))
        self.assertIsNone(parse_tr_date(""))
        self.assertIsNone(parse_tr_date("yakında"))
        self.assertIsNone(parse_tr_date("32.13.2026"))

    def test_days_until_future(self):
        self.assertEqual(days_until("25.09.2026", today=date(2026, 9, 20)), 5)

    def test_days_until_past(self):
        self.assertEqual(days_until("15.09.2026", today=date(2026, 9, 20)), -5)

    def test_days_until_none_when_unparseable(self):
        self.assertIsNone(days_until("bilinmiyor", today=date(2026, 9, 20)))

    def test_urgency_boost_tiers(self):
        self.assertEqual(deadline_urgency_boost(None), 0)
        self.assertEqual(deadline_urgency_boost(-1), 0)
        self.assertEqual(deadline_urgency_boost(0), 40)
        self.assertEqual(deadline_urgency_boost(3), 40)
        self.assertEqual(deadline_urgency_boost(7), 25)
        self.assertEqual(deadline_urgency_boost(14), 10)
        self.assertEqual(deadline_urgency_boost(30), 0)

    def test_risk_flag(self):
        self.assertIsNone(deadline_risk_flag(None))
        self.assertEqual(deadline_risk_flag(-2), "deadline_gecmis")
        self.assertEqual(deadline_risk_flag(1), "deadline_yakin")
        self.assertIsNone(deadline_risk_flag(10))


if __name__ == "__main__":
    unittest.main()
