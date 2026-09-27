import datetime
import subprocess
import unittest
from pathlib import Path

from radar import phase1_ingestion_canary as c

CERTS = Path(c.__file__).resolve().parents[1] / "content" / "certs"


class PinnedIntermediateTests(unittest.TestCase):
    def test_every_pem_is_scoped_and_listed(self):
        on_disk = {p.name for p in CERTS.glob("*.pem")}
        self.assertEqual(on_disk, set(c.PINNED_INTERMEDIATE_HOSTS))

    def test_pins_not_expired_with_margin(self):
        for name in c.PINNED_INTERMEDIATE_HOSTS:
            out = subprocess.run(["openssl", "x509", "-in", str(CERTS / name), "-noout", "-enddate"],
                                 capture_output=True, text=True)
            if out.returncode != 0:
                self.skipTest("openssl unavailable")
            end = datetime.datetime.strptime(out.stdout.strip().split("=")[1], "%b %d %H:%M:%S %Y %Z")
            self.assertGreater(end, datetime.datetime.utcnow() + datetime.timedelta(days=90), name)

    def test_unrelated_host_gets_no_pin(self):
        self.assertIsNone(c._pinned_intermediates_get("https://example.com/", 1))
        self.assertIsNone(c._pinned_intermediates_get("https://evil-ttb.org.tr.example.com/", 1))
        self.assertIsNone(c._pinned_intermediates_get("https://notttb.org.tr/", 1))


if __name__ == "__main__":
    unittest.main()
