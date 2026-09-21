// Confirmed configuration for T7, plus the parity checks that matter.
//
// Finding: fCoSE compound layout requires styleEnabled:true. With
// styleEnabled:false the parent nodes have no computed bounds and the layout's
// grid maths receives NaN -> "RangeError: Invalid array length".
//
// This file verifies the full parity contract in headless mode, so the graph
// layout becomes unit-testable without a browser or a real canvas.

const cytoscape = require("/tmp/t7spike/node_modules/cytoscape");
const fcose = require("/tmp/t7spike/node_modules/cytoscape-fcose");
const fs = require("fs");
cytoscape.use(fcose);

const graph = JSON.parse(fs.readFileSync("/tmp/t7spike/graph.json", "utf8"));
const blocs = [...new Set(graph.nodes.map((n) => n.bloc))].filter(Boolean);

const elements = [
  ...blocs.map((b) => ({ data: { id: `bloc:${b}`, label: b } })),
  ...graph.nodes.map((n) => ({
    data: { id: `f${n.id}`, label: n.label, parent: `bloc:${n.bloc}`, influence: n.influence },
  })),
  ...graph.edges.map((e) => ({
    data: { id: `e${e.id}`, source: `f${e.from}`, target: `f${e.to}`, score: e.score },
  })),
];

// styles MUST be enabled for compound layout
const cy = cytoscape({ headless: true, elements, styleEnabled: true });

const t0 = Date.now();
cy.layout({
  name: "fcose",
  quality: "default",
  animate: false,
  randomize: true,
  numIter: 2500,
  // allied pairs short, rivals long: the political encoding (parity row 10)
  idealEdgeLength: (edge) => {
    const s = edge.data("score") ?? 0;
    return s >= 0 ? 86 - s * 0.22 : 86 + Math.abs(s) * 0.24;
  },
  nodeRepulsion: 4500,
}).run();
const ms = Date.now() - t0;

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  ok ? pass++ : fail++;
};

console.log(`layout: ${ms}ms\n`);

// --- structural ---
const leaves = cy.nodes().filter((n) => !n.isParent());
const parents = cy.nodes().filter((n) => n.isParent());
check("all 58 nodes present", leaves.length === 58, `${leaves.length}`);
check("all 150 edges present", cy.edges().length === 150, `${cy.edges().length}`);
check("5 compound blocs created", parents.length === 5, `${parents.length}`);

// --- positions are real ---
const pos = leaves.map((n) => n.position());
check("every node has finite coords", pos.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
const xs = pos.map((p) => p.x), ys = pos.map((p) => p.y);
check("layout has real extent", Math.max(...xs) - Math.min(...xs) > 50,
  `w=${(Math.max(...xs) - Math.min(...xs)).toFixed(0)} h=${(Math.max(...ys) - Math.min(...ys)).toFixed(0)}`);

// --- no two nodes on top of each other ---
let minPair = Infinity;
for (let i = 0; i < pos.length; i++) {
  for (let j = i + 1; j < pos.length; j++) {
    const d = Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y);
    if (d < minPair) minPair = d;
  }
}
check("no overlapping nodes", minPair > 1, `closest pair = ${minPair.toFixed(1)}`);

// --- parity row 10: the political encoding survived ---
const dist = (a, b) => {
  const pa = cy.getElementById(`f${a}`).position();
  const pb = cy.getElementById(`f${b}`).position();
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
};
let allySum = 0, allyN = 0, rivalSum = 0, rivalN = 0;
for (const e of graph.edges) {
  const d = dist(e.from, e.to);
  if (e.score >= 30) { allySum += d; allyN++; }
  else if (e.score <= -30) { rivalSum += d; rivalN++; }
}
const allyMean = allySum / allyN, rivalMean = rivalSum / rivalN;
check("allies sit closer than rivals", rivalMean > allyMean,
  `ally ${allyMean.toFixed(0)} vs rival ${rivalMean.toFixed(0)}, n=${allyN}/${rivalN}`);

// --- compound grouping actually clusters blocs ---
// Members of the same bloc should be nearer to each other than to outsiders.
let sameSum = 0, sameN = 0, crossSum = 0, crossN = 0;
for (let i = 0; i < graph.nodes.length; i++) {
  for (let j = i + 1; j < graph.nodes.length; j++) {
    const a = graph.nodes[i], b = graph.nodes[j];
    const d = dist(a.id, b.id);
    if (a.bloc === b.bloc) { sameSum += d; sameN++; }
    else { crossSum += d; crossN++; }
  }
}
const sameMean = sameSum / sameN, crossMean = crossSum / crossN;
check("same-bloc members cluster together", crossMean > sameMean,
  `same-bloc ${sameMean.toFixed(0)} vs cross-bloc ${crossMean.toFixed(0)}`);

// --- zoom/pan maths is Cytoscape-native, but verify the primitives ---
const before = cy.getElementById("f1").position();
cy.zoom(1.25);
cy.pan({ x: 120, y: -80 });
const after = cy.getElementById("f1").position();
check("model position independent of camera",
  Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9,
  "pan+zoom left model coords unchanged");

// --- pinned node stays pinned (parity row 1) ---
// Order matters: move the node FIRST, then lock it. Locking before the move
// pins it to the old position and the move is silently ignored.
const target = cy.getElementById("f1");
const pinned = { ...target.position() };
target.position({ x: pinned.x + 150, y: pinned.y + 90 });
target.lock();
cy.layout({ name: "fcose", quality: "default", animate: false, numIter: 500 }).run();
const afterRelayout = target.position();
check("locked node survives a relayout",
  Math.abs(afterRelayout.x - (pinned.x + 150)) < 1 &&
  Math.abs(afterRelayout.y - (pinned.y + 90)) < 1,
  `held at +(${(afterRelayout.x - pinned.x).toFixed(0)}, ${(afterRelayout.y - pinned.y).toFixed(0)})`);

// The unlocked neighbours may move; that is correct and expected.
let moved = 0;
for (const n of leaves) {
  if (n.id() === "f1") continue;
  if (!n.locked()) moved++;
}
check("other nodes are free to settle", moved === 57, `${moved} unlocked`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
