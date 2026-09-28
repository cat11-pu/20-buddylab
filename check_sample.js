import fs from "node:fs";
import { orderFor, buddyOf, insertSorted } from "./buddy.js";
import { alloc, free, stat } from "./heap.js";

const __lines = [];
function emit(label, value) {
  __lines.push([String(label), value]);
}

const spec = JSON.parse(fs.readFileSync(process.argv[2] || "sample/heap.json", "utf8"));

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

function guard(fn, fallback) {
  try {
    return fn();
  } catch (error) {
    return fallback;
  }
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

function play(base, list) {
  let run = copyState(base);
  const marks = [];
  for (const event of list) {
    try {
      if (event && event.kind === "alloc") { run = alloc(run, event.size); }
      else if (event && event.kind === "free") { run = free(run, event.id); }
      else if (event && event.kind === "stat") { run = stat(run); }
      else { throw Object.assign(new Error("E_BAD_EVENT"), { code: "E_BAD_EVENT" }); }
    } catch (error) {
      marks.push([event && event.kind ? String(event.kind) : "空",
                  error && error.code ? error.code : "E_BAD_EVENT"]);
    }
  }
  return { state: run, marks: marks };
}

const events = spec.events || [];
const run = play(spec.state, events);
const state = run.state;
const seen = invariants(state);
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

emit("阶数", state.orders);
emit("堆单位总数", seen.total);
emit("收尾后各阶空闲块", JSON.stringify(state.free));
emit("收尾后空闲块总数", seen.blocks);
emit("收尾后可用单位数", seen.units);
emit("收尾后最大可满足请求", seen.largest);
emit("收尾后已分配块", JSON.stringify(allocRows));
emit("分配成功数", state.granted);
emit("释放成功数", state.released);
emit("分裂次数", state.splits);
emit("合并次数", state.merges);
emit("拒绝次数", state.refused);
emit("拒绝请求序列", JSON.stringify(state.refuses));
emit("编号水位", state.next);
emit("快照记录", JSON.stringify(snapRows));
emit("各阶块合法", seen.legal);
emit("铺满整个堆", seen.tiled);
emit("伙伴合并彻底", seen.merged);
emit("已分配块满足请求", seen.fits);
emit("重放不新增", fingerprint(replay.state) === fingerprint(state) ? 0 : 1);
emit("重放报错条数", replay.marks.length);
emit("拆两轮中间态不同", fingerprint(left.state) !== fingerprint(state) ? 1 : 0);
emit("拆两轮收尾态一致", fingerprint(right.state) === fingerprint(once.state) ? 1 : 0);
emit("拆两轮前半稳定", fingerprint(again.state) === fingerprint(left.state) ? 1 : 0);
emit("异常事件数", run.marks.length);
emit("帮手核值", guard(function () {
  return orderFor(1) + buddyOf(0, 1) + insertSorted([2], 1).length;
}, -1));

// ---- 错误路径探针：真调用实现，看它报出什么码 ----
try {
  orderFor(0);
  emit("零尺寸报码", "没有报错");
} catch (error) {
  emit("零尺寸报码", error && error.code ? error.code : String(error.message));
}
try {
  orderFor(2.5);
  emit("小数尺寸报码", "没有报错");
} catch (error) {
  emit("小数尺寸报码", error && error.code ? error.code : String(error.message));
}
try {
  alloc(copyState(spec.state), -1);
  emit("负尺寸报码", "没有报错");
} catch (error) {
  emit("负尺寸报码", error && error.code ? error.code : String(error.message));
}
try {
  free(copyState(spec.state), 99);
  emit("释放未知编号报码", "没有报错");
} catch (error) {
  emit("释放未知编号报码", error && error.code ? error.code : String(error.message));
}
try {
  let probe = copyState(spec.state);
  probe = alloc(probe, 1);
  probe = free(probe, 1);
  free(probe, 1);
  emit("重复释放报码", "没有报错");
} catch (error) {
  emit("重复释放报码", error && error.code ? error.code : String(error.message));
}

// ---- 期望值（参考模型算出）----
const EXPECTED = {
  "阶数": 5,
  "堆单位总数": 16,
  "收尾后各阶空闲块": [
    [],
    [],
    [],
    [
      0
    ],
    []
  ],
  "收尾后空闲块总数": 1,
  "收尾后可用单位数": 8,
  "收尾后最大可满足请求": 8,
  "收尾后已分配块": [
    [
      7,
      8,
      3,
      5
    ]
  ],
  "分配成功数": 8,
  "释放成功数": 7,
  "分裂次数": 9,
  "合并次数": 8,
  "拒绝次数": 2,
  "拒绝请求序列": [
    9,
    5
  ],
  "编号水位": 9,
  "快照记录": [
    [
      2,
      12,
      8
    ],
    [
      2,
      6,
      4
    ],
    [
      3,
      10,
      4
    ]
  ],
  "各阶块合法": 1,
  "铺满整个堆": 1,
  "伙伴合并彻底": 1,
  "已分配块满足请求": 1,
  "重放不新增": 0,
  "重放报错条数": 0,
  "拆两轮中间态不同": 1,
  "拆两轮收尾态一致": 1,
  "拆两轮前半稳定": 1,
  "异常事件数": 0,
  "帮手核值": 4,
  "零尺寸报码": "E_BAD_SIZE",
  "小数尺寸报码": "E_BAD_SIZE",
  "负尺寸报码": "E_BAD_SIZE",
  "释放未知编号报码": "E_BAD_ID",
  "重复释放报码": "E_BAD_ID"
};
function __same(got, want) {
  if (typeof got === "string") {
    try {
      const parsed = JSON.parse(got);
      if (JSON.stringify(parsed) === JSON.stringify(want)) { return true; }
    } catch (error) { }
  }
  return JSON.stringify(got) === JSON.stringify(want);
}
let __bad = 0;
for (const [label, want] of Object.entries(EXPECTED)) {
  const found = __lines.find((pair) => pair[0] === label);
  if (!found) {
    __bad += 1;
    console.log("缺失验收项 " + label);
    continue;
  }
  if (__same(found[1], want)) {
    console.log("一致 " + label + " = " + JSON.stringify(found[1]));
  } else {
    __bad += 1;
    console.log("不一致 " + label + " 期望 " + JSON.stringify(want) + " 实际 " + JSON.stringify(found[1]));
  }
}
console.log("验收项 " + (Object.keys(EXPECTED).length - __bad) + "/" + Object.keys(EXPECTED).length + " 通过");
process.exit(__bad === 0 ? 0 : 1);
