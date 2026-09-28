// app.js：把伙伴堆场景跑成一份布局视图（空闲表、已分配块、计数与四条不变量）
import { orderFor, buddyOf, insertSorted } from "./buddy.js";
import { alloc, free, stat } from "./heap.js";

function copyState(state) {
  return {
    orders: state.orders,
    free: (state.free || []).map(function (row) { return row.slice(); }),
    allocs: (state.allocs || []).map(function (item) {
      return { id: item.id, start: item.start, order: item.order, size: item.size };
    }),
    splits: state.splits || 0,
    merges: state.merges || 0,
    granted: state.granted || 0,
    released: state.released || 0,
    refused: state.refused || 0,
    refuses: (state.refuses || []).slice(),
    snaps: (state.snaps || []).map(function (item) {
      return { blocks: item.blocks, units: item.units, largest: item.largest };
    }),
    next: state.next || 0
  };
}

function invariants(state) {
  const orders = state.orders;
  const top = orders - 1;
  const total = 1 << top;
  const grid = [];
  for (let unit = 0; unit < total; unit += 1) { grid.push(0); }
  const free = state.free || [];
  const allocs = state.allocs || [];
  let legal = 1;
  let merged = 1;
  let fits = 1;
  for (let order = 0; order <= top; order += 1) {
    const row = Array.isArray(free[order]) ? free[order] : [];
    for (let at = 0; at < row.length; at += 1) {
      const start = row[at];
      const span = 1 << order;
      if (!Number.isInteger(start) || start < 0 || start + span > total || start % span !== 0) {
        legal = 0;
        continue;
      }
      if (at > 0 && !(row[at - 1] < start)) { legal = 0; }
      if (row.indexOf(start ^ span) >= 0) { merged = 0; }
      for (let unit = start; unit < start + span; unit += 1) {
        if (grid[unit] !== 0) { legal = 0; }
        grid[unit] = 1;
      }
    }
  }
  for (const item of allocs) {
    if (!item || !Number.isInteger(item.start) || !Number.isInteger(item.order) ||
        !Number.isInteger(item.size)) {
      fits = 0;
      legal = 0;
      continue;
    }
    const span = 1 << item.order;
    if (span < item.size || span >= 2 * item.size) { fits = 0; }
    if (item.start < 0 || item.start + span > total || item.start % span !== 0) {
      fits = 0;
      legal = 0;
      continue;
    }
    for (let unit = item.start; unit < item.start + span; unit += 1) {
      if (grid[unit] !== 0) { legal = 0; }
      grid[unit] = 1;
    }
  }
  let tiled = 1;
  for (let unit = 0; unit < total; unit += 1) { if (grid[unit] === 0) { tiled = 0; } }
  let blocks = 0;
  let units = 0;
  let largest = 0;
  for (let order = 0; order <= top; order += 1) {
    const row = Array.isArray(free[order]) ? free[order] : [];
    blocks += row.length;
    units += row.length * (1 << order);
    if (row.length > 0 && (1 << order) > largest) { largest = 1 << order; }
  }
  return { legal: legal, tiled: tiled, merged: merged, fits: fits,
           blocks: blocks, units: units, largest: largest, total: total };
}

function fingerprint(state) {
  return JSON.stringify([state.free, state.allocs, state.splits, state.merges, state.granted,
                         state.released, state.refused, state.refuses, state.next, state.snaps]);
}

export function render(spec) {
  let state = copyState(spec.state);
  const marks = [];
  const events = spec.events || [];
  for (const event of events) {
    try {
      if (event && event.kind === "alloc") { state = alloc(state, event.size); }
      else if (event && event.kind === "free") { state = free(state, event.id); }
      else if (event && event.kind === "stat") { state = stat(state); }
      else { throw Object.assign(new Error("E_BAD_EVENT"), { code: "E_BAD_EVENT" }); }
    } catch (error) {
      marks.push([event && event.kind ? String(event.kind) : "空",
                  error && error.code ? error.code : "E_BAD_EVENT"]);
    }
  }
  const view = invariants(state);
  const play = function (base, list) {
    let run = copyState(base);
    const bad = [];
    for (const event of list) {
      try {
        if (event && event.kind === "alloc") { run = alloc(run, event.size); }
        else if (event && event.kind === "free") { run = free(run, event.id); }
        else if (event && event.kind === "stat") { run = stat(run); }
        else { throw Object.assign(new Error("E_BAD_EVENT"), { code: "E_BAD_EVENT" }); }
      } catch (error) {
        bad.push(error && error.code ? error.code : "E_BAD_EVENT");
      }
    }
    return { state: run, bad: bad };
  };
  const half = Math.ceil(events.length / 2);
  const once = play(spec.state, events);
  const left = play(spec.state, events.slice(0, half));
  const right = play(left.state, events.slice(half));
  const again = play(spec.state, events.slice(0, half));
  const replay = play(spec.state, events);
  const allocRows = (state.allocs || []).map(function (item) {
    return [item.id, item.start, item.order, item.size];
  });
  const snapRows = (state.snaps || []).map(function (item) {
    return [item.blocks, item.units, item.largest];
  });
  let helper = -1;
  try {
    helper = orderFor(1) + buddyOf(0, 1) + insertSorted([2], 1).length;
  } catch (error) {
    helper = -1;
  }
  return {
    orders: state.orders,
    total: view.total,
    free: (state.free || []).map(function (row) { return row.slice(); }),
    allocs: allocRows,
    blocks: view.blocks,
    units: view.units,
    largest: view.largest,
    granted: state.granted,
    released: state.released,
    splits: state.splits,
    merges: state.merges,
    refused: state.refused,
    refuses: (state.refuses || []).slice(),
    next: state.next,
    snaps: snapRows,
    legal: view.legal,
    tiled: view.tiled,
    merged: view.merged,
    fits: view.fits,
    replay_new: fingerprint(replay.state) === fingerprint(state) ? 0 : 1,
    replay_failed: replay.bad.length,
    mid_differs: fingerprint(left.state) !== fingerprint(state) ? 1 : 0,
    split_equal: fingerprint(right.state) === fingerprint(once.state) ? 1 : 0,
    half_stable: fingerprint(again.state) === fingerprint(left.state) ? 1 : 0,
    failed_events: marks.length,
    failed_marks: marks,
    helper: helper,
    count_events: events.length
  };
}
