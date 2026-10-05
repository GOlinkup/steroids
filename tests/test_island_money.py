"""Money + onboarding backend tests: subunit money, gig adapters,
mirror-only profile, unlink-empty. Stdlib only; no network (Remotive
runs on a fake opener).
"""
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "island"))

import gigs  # noqa: E402
import profile  # noqa: E402


def _remotive(rows):
    class Resp:
        def read(self):
            return json.dumps({"jobs": rows}).encode()
    return lambda url, timeout=15: Resp()


class MoneyTest(unittest.TestCase):
    def test_exact_strings_no_floats(self):
        self.assertEqual(gigs.money_cents(0), "R 0,00")
        self.assertEqual(gigs.money_cents(1), "R 0,01")
        self.assertEqual(gigs.money_cents(99), "R 0,99")
        self.assertEqual(gigs.money_cents(100), "R 1,00")
        self.assertEqual(gigs.money_cents(123456), "R 1 234,56")
        self.assertEqual(gigs.money_cents(100000000), "R 1 000 000,00")
        self.assertEqual(gigs.money_cents(-50), "-R 0,50")

    def test_every_money_string_matches_subunit_shape(self):
        import re
        shape = re.compile(r"^-?R [\d ]+,\d{2}$")
        for c in (0, 1, 5, 99, 100, 101, 999, 1000, 123456, 99999999):
            self.assertRegex(gigs.money_cents(c), shape)
            self.assertRegex(gigs.money_cents(-c), shape)


class GigsTest(unittest.TestCase):
    def test_native_first_seed_after_dead_seed_keeps_native(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "g.json")
            json.dump([{"id": "a", "title": "Fix fence",
                        "pay_cents": 25000}], open(path, "w"))
            seed = _remotive([{"id": 1, "title": "Async writer",
                               "company_name": "Acme",
                               "salary": "$50k - $70k",
                               "job_type": "contract",
                               "candidate_required_location": "Worldwide"},
                              {"id": 2, "title": ""}])
            rows = gigs.load(10, path, seed, now=1700000000)["gigs"]
            self.assertEqual([r["id"] for r in rows],
                             ["native-a", "remotive-1"])
            self.assertEqual(rows[0]["money"], "R 250,00")
            self.assertIsNone(rows[1]["pay_cents"])  # never parsed
            self.assertEqual(rows[1]["pay_text"], "$50k - $70k")
            self.assertEqual(rows[1]["attribution"], gigs.ATTRIBUTION)
            self.assertEqual(rows[1]["seeded_at"], 1700000000)
            # Dead seed keeps native.
            dead = gigs.load(10, path, lambda u, timeout=15: 1 / 0)
            self.assertEqual([r["id"] for r in dead["gigs"]],
                             ["native-a"])

    def test_add_validates_types_and_roundtrips(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "g.json")
            self.assertIsNone(gigs.add_native("", 100, path=path))
            self.assertIsNone(gigs.add_native("X", "100", path=path))
            self.assertIsNone(gigs.add_native("X", 12.5, path=path))
            gid = gigs.add_native("Mow lawn", 15000, path=path)
            self.assertTrue(gid)
            rows = gigs.native_rows(path)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["money"], "R 150,00")


class ProfileTest(unittest.TestCase):
    def test_unlinked_empty_unlink_empty(self):
        real = profile.LINKS_FILE
        with tempfile.TemporaryDirectory() as d:
            profile.LINKS_FILE = os.path.join(d, "links.json")
            try:
                self.assertEqual(profile.mirror()["user_id"], "")
                self.assertEqual(profile.unlink()["user_id"], "")
                json.dump({"user_id": "u1", "handle": "Lerato M",
                           "verified": True, "gigs_done": 3},
                          open(profile.LINKS_FILE, "w"))
                got = profile.mirror()
                self.assertEqual(got["handle"], "Lerato M")
                self.assertTrue(got["verified"])
                self.assertEqual(got["gigs_done"], 3)
                self.assertIsNone(got["bio"])  # never invented
                self.assertEqual(profile.unlink()["user_id"], "")
                self.assertFalse(os.path.exists(profile.LINKS_FILE))
            finally:
                profile.LINKS_FILE = real


if __name__ == "__main__":
    unittest.main()
