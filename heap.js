// heap.js：分配、释放、快照（基线：一律原样返回状态）
import { orderFor, buddyOf, insertSorted } from "./buddy.js";

export function alloc(state, size) {
  const need = orderFor(size);
  const top = state.orders - 1;
  let chosen = need;
  while (chosen <= top && (!state.free[chosen] || state.free[chosen].length === 0)) {
    chosen += 1;
  }
  if (chosen > top) {
    return Object.assign({}, state, {
      refused: state.refused + 1,
      refuses: state.refuses.concat([size])
    });
  }
  const free = state.free.map(function (row) { return row.slice(); });
  let start = free[chosen].shift();
  let splits = state.splits;
  let order = chosen;
  while (order > need) {
    order -= 1;
    const half = 1 << order;
    free[order] = insertSorted(free[order], start + half);
    splits += 1;
  }
  const id = state.next;
  return Object.assign({}, state, {
    free: free,
    allocs: state.allocs.concat([{ id: id, start: start, order: need, size: size }]),
    splits: splits,
    granted: state.granted + 1,
    next: id + 1
  });
}

export function free(state, id) {
  const index = state.allocs.findIndex(function (item) { return item.id === id; });
  if (index < 0) {
    throw Object.assign(new Error("E_BAD_ID"), { code: "E_BAD_ID" });
  }
  const block = state.allocs[index];
  const allocs = state.allocs.slice();
  allocs.splice(index, 1);
  const freeRows = state.free.map(function (row) { return row.slice(); });
  let order = block.order;
  let start = block.start;
  let merges = state.merges;
  const top = state.orders - 1;
  while (order < top) {
    const buddy = buddyOf(start, order);
    const at = freeRows[order].indexOf(buddy);
    if (at < 0) { break; }
    freeRows[order].splice(at, 1);
    start = Math.min(start, buddy);
    order += 1;
    merges += 1;
  }
  freeRows[order] = insertSorted(freeRows[order], start);
  return Object.assign({}, state, {
    free: freeRows,
    allocs: allocs,
    merges: merges,
    released: state.released + 1
  });
}

export function stat(state) {
  let blocks = 0;
  let units = 0;
  let largest = 0;
  for (let order = 0; order < state.orders; order += 1) {
    const row = state.free[order] || [];
    blocks += row.length;
    units += row.length * (1 << order);
    if (row.length > 0 && (1 << order) > largest) { largest = 1 << order; }
  }
  return Object.assign({}, state, {
    snaps: state.snaps.concat([{ blocks: blocks, units: units, largest: largest }])
  });
}
