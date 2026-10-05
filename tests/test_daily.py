"""Steroids daily tests — fixtures only, zero network."""
import json
import os
import tempfile
import unittest

from steroids.daily import (age_label, fetch_gdelt, fetch_rss,
                            fetch_weather, load_briefing, log_event,
                            resolve_track, today_events)

GDELT = {"articles": [
    {"title": "SA power update", "url": "https://x.test/a",
     "source": "x"},
    {"title": "", "url": "https://x.test/b"},
    {"title": "No link here", "url": "ftp://x.test/c"},
]}

RSS = """<rss><channel>
<item><title>BBC One</title><link>https://x.test/1</link></item>
<item><title></title><link>https://x.test/2</link></item>
</channel></rss>"""

SEARCH = {"contents": {"twoColumnSearchResultsRenderer": {
    "primaryContents": {"sectionListRenderer": {"contents": [
        {"itemSectionRenderer": {"contents": [
            {"videoRenderer": {"videoId": "vid9"}}]}}]}}}}}

OEMBED = {"title": "Amapiano Mix", "author_name": "DJ T"}


class DailyTest(unittest.TestCase):
    def test_gdelt_maps_bad_rows_drop(self):
        rows = fetch_gdelt(get=lambda u: json.dumps(GDELT))
        self.assertEqual([(r["title"], r["source"]) for r in rows],
                         [("SA power update", "GDELT")])

    def test_rss_maps_blank_title_drops(self):
        rows = fetch_rss(get=lambda u: RSS)
        self.assertEqual([r["title"] for r in rows], ["BBC One"])

    def test_weather_line_shape(self):
        w = fetch_weather(get=lambda u: json.dumps(
            {"current": {"temperature_2m": 24.5, "time": "2026-10-05T06:00"}}))
        self.assertEqual(w["line"], "Malamulele now: 24.5°C")

    def test_briefing_caches_and_serves_stale_stamped(self):
        d = tempfile.mkdtemp()
        cache = os.path.join(d, "b.json")
        live = load_briefing(
            cache, now=1000,
            gdelt=lambda: [{"title": "T", "url": "https://x/1",
                            "source": "GDELT"}],
            rss=lambda: [],
            weather=lambda: {"line": "Malamulele now: 20°C",
                            "observedUtc": "2026-10-05T06:00"})
        self.assertFalse(live["offline"])
        self.assertTrue(os.path.exists(cache))
        # all dead -> stamped cache, original fetchedAt kept
        stale = load_briefing(
            cache, now=4600,
            gdelt=lambda: [], rss=lambda: [], weather=lambda: None)
        self.assertTrue(stale["offline"])
        self.assertEqual(stale["fetchedAt"], 1000)
        self.assertEqual(stale["headlines"][0]["title"], "T")

    def test_briefing_cold_start_honest_empty(self):
        d = tempfile.mkdtemp()
        b = load_briefing(os.path.join(d, "missing.json"), now=500,
                          gdelt=lambda: [], rss=lambda: [],
                          weather=lambda: None)
        self.assertEqual(
            (b["headlines"], b["weatherLine"], b["offline"], b["fetchedAt"]),
            ([], "", True, 500))

    def test_age_labels_never_fake_fresh(self):
        self.assertEqual(
            (age_label(1000, 1030), age_label(1000, 2200),
             age_label(1000, 4600), age_label(1000, 90000)),
            ("just now", "20m ago", "1h ago", "1d ago"))

    def test_day_log_roundtrip_empty_honest(self):
        d = tempfile.mkdtemp()
        log = os.path.join(d, "day.jsonl")
        self.assertEqual(today_events(log, now=1000), [])
        log_event(log, "music_play", "Played Amapiano Mix", at=1000)
        log_event(log, "task_done", "Filed report", at=1001)
        self.assertEqual([e["label"] for e in today_events(log, now=1001)],
                         ["Played Amapiano Mix", "Filed report"])

    def test_resolve_track_shape_and_honest_none(self):
        t = resolve_track(
            "amapiano mix",
            get=lambda u: json.dumps(OEMBED),
            post=lambda q: SEARCH)
        self.assertEqual(
            (t["videoId"], t["title"], t["author"]),
            ("vid9", "Amapiano Mix", "DJ T"))
        self.assertIsNone(resolve_track(
            "zzz", get=lambda u: json.dumps({}),
            post=lambda q: {"contents": {}}))
        boom = resolve_track(
            "zzz", get=lambda u: 1 / 0, post=lambda q: 1 / 0)
        self.assertIsNone(boom)


if __name__ == "__main__":
    unittest.main()
