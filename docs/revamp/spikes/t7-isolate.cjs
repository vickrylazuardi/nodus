// Same investigation, but each case runs in a child process with a hard
// timeout. The previous run hung, so a case that never returns must not be
// able to stall the whole experiment.
//
// Usage: node why2.js <case>
//   cases: comp-nostyle comp-style comp-nest1 comp-nest5 comp-sep plain-nostyle plain-style

const cytoscape = require("/tmp/t7spike/node_modules/cytoscape");
const fcose = require("/tmp/t7spike/node_modules/cytoscape-fcose");
const fs = require("fs");
cytoscape.use(fcose);

const CASES = {
  "comp-nostyle": { compound: true, styleEnabled: false },
  "comp-style": { compound: true, styleEnabled: true },
  "comp-nest1": { compound: true, styleEnabled: false, nestingFactor: 0.1 },
  "comp-nest5": { compound: true, styleEnabled: false, nestingFactor: 0.5 },
  "comp-sep": { compound: true, styleEnabled: false, nodeSep: 300 },
  "plain-nostyle": { compound: false, styleEnabled: false },
  "plain-style": { compound: false, styleEnabled: true },
};

const which = process.argv[2];
const opts = CASES[which];
if (!opts) {
  console.error("unknown case:", which);
  process.exit(2);
}

const graph = JSON.parse(fs.readFileSync("/tmp/t7spike/graph.json", "utf8"));
const blocs = [...new Set(graph.nodes.map((n) => n.bloc))].filter(Boolean);
const { compound, styleEnabled, nestingFactor, nodeSep } = opts;

const elements = [
  ...(compound ? blocs.map((b) => ({ data: { id: `bloc:${b}`, label: b } })) : []),
  ...graph.nodes.map((n) => ({
    data: { id: `f${n.id}`, label: n.label, ...(compound && n.bloc ? { parent: `bloc:${n.bloc}` } : {}) },
  })),
  ...graph.edges.map((e) => ({
    data: { id: `e${e.id}`, source: `f${e.from}`, target: `f${e.to}`, score: e.score },
  })),
];

const cy = cytoscape({ headless: true, elements, styleEnabled });
const t0 = Date.now();
cy.layout({
  name: "fcose",
  quality: "default",
  animate: false,
  randomize: true,
  numIter: 2500,
  idealEdgeLength: 100,
  ...(nestingFactor !== undefined ? { nestingFactor } : {}),
  ...(nodeSep !== undefined ? { nodeSeparation: nodeSep } : {}),
}).run();
const ms = Date.now() - t0;

const pos = cy.nodes().filter((n) => !n.isParent()).map((n) => n.position());
const finite = pos.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).length;
const parents = cy.nodes().filter((n) => n.isParent()).length;
console.log(`PASS ${which} :: ${ms}ms, ${finite}/${graph.nodes.length} positioned, ${parents} parents`);
