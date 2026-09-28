// heap.js：分配、释放、快照（基线：一律原样返回状态）
import { orderFor, buddyOf, insertSorted } from "./buddy.js";

export function alloc(state, size) {
  return state;
}

export function free(state, id) {
  return state;
}

export function stat(state) {
  return state;
}
