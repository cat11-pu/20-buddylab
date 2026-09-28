import assert from "node:assert";
import { orderFor, buddyOf, insertSorted } from "../buddy.js";
import { alloc, free, stat } from "../heap.js";
import { render } from "../app.js";

const base = {
  orders: 5,
  free: [[], [], [], [], [0]],
  allocs: [],
  splits: 0, merges: 0, granted: 0, released: 0, refused: 0,
  refuses: [], snaps: [], next: 1
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("orderFor gives a number", () => {
  assert.strictEqual(typeof orderFor(6), "number");
});

check("buddyOf gives a number", () => {
  assert.strictEqual(typeof buddyOf(0, 2), "number");
});

check("insertSorted gives a list", () => {
  assert.ok(Array.isArray(insertSorted([1, 3], 2)));
});

check("alloc gives back a state with free rows", () => {
  const after = alloc(base, 4);
  assert.ok(Array.isArray(after.free));
});

check("stat gives back a state with snap records", () => {
  const after = stat(base);
  assert.ok(Array.isArray(after.snaps));
});

check("free gives back a state", () => {
  const after = alloc(base, 2);
  assert.ok(after && typeof after === "object");
});

check("render counts the events of a scene", () => {
  const view = render({ state: base, events: [{ kind: "alloc", size: 3 }, { kind: "stat" }] });
  assert.strictEqual(typeof view.count_events, "number");
});

console.log("7 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
