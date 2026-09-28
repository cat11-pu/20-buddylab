// buddy.js：阶与伙伴的换算（基线：一律给零与空）
export function orderFor(size) {
  if (!Number.isInteger(size) || size <= 0) {
    throw Object.assign(new Error("E_BAD_SIZE"), { code: "E_BAD_SIZE" });
  }
  let order = 0;
  let span = 1;
  while (span < size) {
    span <<= 1;
    order += 1;
  }
  return order;
}

export function buddyOf(start, order) {
  return start ^ (1 << order);
}

export function insertSorted(list, start) {
  const next = list.slice();
  let at = 0;
  while (at < next.length && next[at] < start) { at += 1; }
  next.splice(at, 0, start);
  return next;
}
