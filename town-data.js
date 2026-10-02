/* st-20 town live-data module — Sael pattern for the static town page.
 * Live-then-snapshot: fetch the deployed JSON first (fresh regen wins);
 * fall back to the last-good copy cached in localStorage (baked fallback).
 * No dependencies. Classic script: sets window.TownData before the module
 * script runs (module scripts are deferred, order holds).
 *
 *   <script src="town-data.js"></script>   <!-- before the module script -->
 *   TownData.load().then(({snapshot, trends, source}) => { ... });
 *   // source: 'live' | 'cache' | 'none'
 *   // snapshot: st-10 shape {generated_at, totals, domains:[{name,skills,routes,tokens_saved}]}
 *   // trends:   {generated_at, days:[YYYY-MM-DD], domains:[{name, daily:[n...]}]}
 *   //           daily[i] = routed-skill rows for that domain on days[i]
 */
(function () {
  'use strict';
  var LS_SNAP = 'town.snapshot.v1', LS_TRENDS = 'town.trends.v1';

  function read(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function stash(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function get(url) {
    return fetch(url, {cache: 'no-store'}).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    });
  }

  var TownData = {
    snapshotUrl: 'snapshot.json',
    trendsUrl: 'trends.json',
    // Global counters hub (Maldrive Supabase). GET = merged totals for ALL
    // users (shared learning); plugins POST daily rollups here.
    hubUrl: 'https://jqvpuyzawidrcwgnphqu.supabase.co/storage/v1/object/public/steroids-public/shared.json',
    hubFallbackUrl: 'https://jqvpuyzawidrcwgnphqu.supabase.co/functions/v1/steroids-ping',
    load: function (opts) {
      opts = opts || {};
      var sUrl = opts.snapshotUrl || TownData.snapshotUrl;
      var tUrl = opts.trendsUrl || TownData.trendsUrl;
      return Promise.allSettled([get(sUrl), get(tUrl)]).then(function (res) {
        var snap = res[0].status === 'fulfilled' ? res[0].value : null;
        var trends = res[1].status === 'fulfilled' ? res[1].value : null;
        if (snap && trends) {
          stash(LS_SNAP, snap); stash(LS_TRENDS, trends);
          return {snapshot: snap, trends: trends, source: 'live'};
        }
        var cached = {snapshot: read(LS_SNAP), trends: read(LS_TRENDS)};
        if (cached.snapshot && cached.trends) {
          return {snapshot: cached.snapshot, trends: cached.trends, source: 'cache'};
        }
        // Partial live beats nothing: return what fetched, flag the rest.
        if (snap || trends) return {snapshot: snap, trends: trends, source: 'live'};
        return {snapshot: null, trends: null, source: 'none'};
      });
    }
  };

  window.TownData = TownData;
})();
