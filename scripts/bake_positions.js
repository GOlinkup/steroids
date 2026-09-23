// One-time layout bake for F54: runs the page's own 60-tick force layout over
// the live graph and dumps node positions to demo/skill-graph.positions.json
// so page load skips physics (<2s). Run: node scripts/bake_positions.js
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "demo", "skill-graph.html"), "utf8");
const inline = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const mkCtx = () => new Proxy({}, { get: () => (...a) => undefined });
const mkEl = () => ({ getContext: () => mkCtx(),
  getBoundingClientRect: () => ({ width: 1280, height: 800 }),
  addEventListener: () => {}, style: {}, textContent: "", value: "" });
global.window = { devicePixelRatio: 1, addEventListener: () => {}, Mascot: undefined };
global.document = { getElementById: () => mkEl(), createElement: () => mkEl(), body: mkEl() };
global.navigator = {};
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => {};
global.fetch = () => Promise.reject(new Error("bake has no network"));
eval(inline);
const g = JSON.parse(fs.readFileSync(path.join(root, "demo", "skill-graph.json"), "utf8"));
data = { nodes: g.nodes.map(n => ({ id: n.id, keywords: n.keywords })), links: g.links || [] };
init();
const baked = {};
nodes.forEach(n => { baked[n.id] = [Math.round(n.x * 10) / 10, Math.round(n.y * 10) / 10]; });
fs.writeFileSync(path.join(root, "demo", "skill-graph.positions.json"), JSON.stringify(baked));
console.log(`baked ${Object.keys(baked).length} positions`);
