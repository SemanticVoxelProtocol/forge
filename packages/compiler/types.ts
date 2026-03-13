// 编译器内部中间表示（IR）
// 解析 YAML 后的结构，和 L3/L4 解耦

/** Pin 的中间表示 */
export interface PinIr {
  readonly name: string;
  readonly type: string;
  readonly optional?: boolean;
}

/** 图中节点引用 */
export interface NodeRefIr {
  readonly id: string;
  readonly type: string; // 引用的节点名
}

/** 连线中间表示 */
export interface WireIr {
  readonly from: string; // "stepId.pinName" 或 "input.pinName"
  readonly to: string; // "stepId.pinName" 或 "output.pinName"
}

/** 节点中间表示（原子节点 + 复合节点通用） */
export interface NodeIr {
  readonly name: string;
  readonly type?: "composite"; // 缺省为原子
  readonly pins: {
    readonly input: readonly PinIr[];
    readonly output: readonly PinIr[];
  };
  readonly validate?: Readonly<Record<string, string>>;
  readonly constraints?: readonly string[];
  readonly description?: string;
  // 复合节点专有
  readonly nodes?: readonly NodeRefIr[];
  readonly wires?: readonly WireIr[];
}

/** 图中间表示 */
export interface GraphIr {
  readonly name: string;
  readonly description?: string;
  readonly input?: readonly PinIr[];
  readonly output?: readonly PinIr[];
  readonly trigger?: {
    readonly type: "http" | "event" | "schedule" | "manual";
    readonly config: Readonly<Record<string, unknown>>;
  };
  readonly nodes: readonly NodeRefIr[];
  readonly wires: readonly WireIr[];
}

/** 编译结果统计 */
export interface CompileResult {
  readonly l3Blocks: readonly string[]; // 生成的 L3 block IDs
  readonly l4Flows: readonly string[]; // 生成的 L4 flow IDs
}

/** 编译错误 */
export interface CompileError {
  readonly code: string;
  readonly message: string;
  readonly path?: string; // 出错的文件路径
}
