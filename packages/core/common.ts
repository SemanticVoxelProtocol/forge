// 跨层共享类型

// 层间溯源：记录这个数据从哪来的
export interface Source {
  readonly type: string; // 上层类型，如 "l4"、"l5"、"direct"（直接编写）
  readonly ref?: string; // 上层单元 ID（type 为 direct 时无）
  readonly hash: string; // 源内容哈希（源头改了就不匹配 → 需要重编译）
}
