// Result<T, E> — 显式错误处理，不用 throw
// 只有「不应该发生」的 bug 才用 throw

export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** 从 Result 中取值，失败时 throw（仅用于测试或确定不会失败的场景） */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw new Error(`unwrap failed: ${String(result.error)}`);
}
