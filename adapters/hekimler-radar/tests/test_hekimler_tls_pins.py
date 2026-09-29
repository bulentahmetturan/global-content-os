import ssl
import time
import unittest
from pathlib import Path

from radar import phase1_ingestion_canary as c

CERTS = Path(c.__file__).resolve().parents[1] / "content" / "certs"


class PinnedIntermediateTests(unittest.TestCase):
    def test_every_pem_is_scoped_and_listed(self):
        on_disk = {p.name for p in CERTS.glob("*.pem")}
        self.assertEqual(on_disk, set(c.PINNED_INTERMEDIATE_HOSTS))

    def test_pins_not_expired_with_margin(self):
        # Decoded in-process (CPython's bundled OpenSSL) so the check never depends on an openssl binary on PATH.
        for name in c.PINNED_INTERMEDIATE_HOSTS:
            not_after = ssl._ssl._test_decode_cert(str(CERTS / name))["notAfter"]
            end = ssl.cert_time_to_seconds(not_after)
            self.assertGreater(end, time.time() + 90 * 86400, name)

    def test_unrelated_host_gets_no_pin(self):
        self.assertIsNone(c._pinned_intermediates_get("https://example.com/", 1))
        self.assertIsNone(c._pinned_intermediates_get("https://evil-ttb.org.tr.example.com/", 1))
        self.assertIsNone(c._pinned_intermediates_get("https://notttb.org.tr/", 1))


if __name__ == "__main__":
    unittest.main()
