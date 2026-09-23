// F54: graph explorer loads <2s — headless timing of the real page logic.
// Stubs browser globals, evals the inline script from demo/skill-graph.html,
// times JSON parse + init() layout (60 force ticks over the live 1265 nodes).
// Exit 0 iff total < 2000ms. Run: node scripts/explorer_load_probe.js
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "demo", "skill-graph.html"), "utf8");
const inline = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const mkCtx = () => new Proxy({}, { get: (t, k) => {
  if (k === "canvas") return {};
  return (...a) => undefined; } });
const mkEl = () => ({ getContext: () => mkCtx(),
  getBoundingClientRect: () => ({ width: 1280, height: 800 }),
  addEventListener: () => {}, style: {}, textContent: "",
  value: "", width: 0, height: 0 });
global.window = { devicePixelRatio: 1, addEventListener: () => {}, Mascot: undefined };
global.document = { getElementById: () => mkEl(), createElement: () => mkEl(), body: mkEl() };
global.navigator = {};
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => {};
global.fetch = () => Promise.reject(new Error("offline probe"));

let t0 = Date.now();
const raw = fs.readFileSync(path.join(root, "demo", "skill-graph.json"), "utf8");
const parsed = JSON.parse(raw);
const tParse = Date.now() - t0;
window.GRAPH_POS = JSON.parse(fs.readFileSync(
  path.join(root, "demo", "skill-graph.positions.json"), "utf8"));
const tPos = Date.now() - t0 - tParse;
eval(inline); // defines init/draw/tick/nodes + runs init();draw()
const tSample = Date.now() - t0 - tParse - tPos;
// now the live set: same data swap the fetch path does (positions skip ticks)
t0 = Date.now();
data = { nodes: parsed.nodes.map(n => ({ id: n.id, keywords: n.keywords })),
         links: parsed.links || [] };
init(); draw();
const tLive = Date.now() - t0;
const total = tParse + tPos + tLive;
console.log(`parse=${tParse}ms positions=${tPos}ms sample_init=${tSample}ms live1265_baked=${tLive}ms total=${total}ms nodes=${data.nodes.length}`);
console.log(total < 2000 ? "LOAD-OK (<2s)" : "LOAD-FAIL (>=2s)");
process.exit(total < 2000 ? 0 : 1);
