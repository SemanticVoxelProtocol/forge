// GraphIR → L4Flow 编译（核心复杂度）
// 包含：DAG 构建、拓扑排序、扇出/汇聚检测、step 生成

import { hashL4 } from "../core/hash.js";
import { err, ok } from "../core/result.js";
import type { CompileError, GraphIr, NodeIr } from "./types.js";
import type { DataFlow, Step, L4Flow } from "../core/l4.js";
import type { Result } from "../core/result.js";
import type { ArtifactVersion } from "../core/version.js";

/** 已知的复合节点名集合 */
type CompositeNodeNames = ReadonlySet<string>;

/** 将图 IR 编译为 L4Flow */
export function compileGraph(
  graph: GraphIr,
  compositeNames: CompositeNodeNames = new Set(),
): Result<L4Flow, CompileError> {
  // 1. 构建 DAG：从 wires 提取节点间依赖（忽略 input.*/output.* 端口）
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const adjacency = new Map<string, Set<string>>(); // from → to 的下游集合
  const inDegree = new Map<string, number>();

  for (const id of nodeIds) {
    adjacency.set(id, new Set());
    inDegree.set(id, 0);
  }

  for (const wire of graph.wires) {
    const fromNodeId = wire.from.split(".")[0];
    const toNodeId = wire.to.split(".")[0];

    // 跳过图级端口（input.*/output.*）
    if (
      fromNodeId === "input" ||
      fromNodeId === "output" ||
      toNodeId === "input" ||
      toNodeId === "output"
    ) {
      continue;
    }

    // 只处理两个不同节点之间的连线
    if (fromNodeId !== toNodeId && nodeIds.has(fromNodeId) && nodeIds.has(toNodeId)) {
      const downstream = adjacency.get(fromNodeId)!;
      if (!downstream.has(toNodeId)) {
        downstream.add(toNodeId);
        inDegree.set(toNodeId, (inDegree.get(toNodeId) ?? 0) + 1);
      }
    }
  }

  // 2. 拓扑排序（Kahn 算法）
  const topoResult = topologicalSort(nodeIds, adjacency, inDegree);
  if (!topoResult.ok) {
    return err({
      code: "CYCLE_DETECTED",
      message: `图 "${graph.name}" 中检测到环: ${topoResult.error}`,
    });
  }
  const sorted = topoResult.value;

  // 3. 构建反向邻接表（用于汇聚检测）
  const reverseAdj = new Map<string, Set<string>>();
  for (const id of nodeIds) {
    reverseAdj.set(id, new Set());
  }
  for (const [from, toSet] of adjacency) {
    for (const to of toSet) {
      reverseAdj.get(to)!.add(from);
    }
  }

  // 4. 构建 nodeType 映射
  const nodeTypeMap = new Map<string, string>();
  for (const n of graph.nodes) {
    nodeTypeMap.set(n.id, n.type);
  }

  // 5. 生成 steps
  const steps = generateSteps(sorted, adjacency, reverseAdj, nodeTypeMap, compositeNames);

  // 6. 生成 dataFlows
  const dataFlows = generateDataFlows(graph);

  // 7. 组装 L4Flow
  const revision: ArtifactVersion = {
    rev: 1,
    parentRev: null,
    source: { type: "init" },
    timestamp: new Date().toISOString(),
  };

  const partial = {
    id: graph.name,
    name: graph.name,
    ...(graph.trigger === undefined ? {} : { trigger: graph.trigger }),
    steps,
    dataFlows,
  };

  const contentHash = hashL4(partial);

  const flow: L4Flow = {
    ...partial,
    revision,
    contentHash,
  };

  return ok(flow);
}

/** 将复合节点 IR 编译为子 L4Flow */
export function compileCompositeNode(
  node: NodeIr,
  compositeNames: CompositeNodeNames = new Set(),
): Result<L4Flow, CompileError> {
  if (node.nodes === undefined || node.wires === undefined) {
    return err({
      code: "INVALID_COMPOSITE",
      message: `复合节点 "${node.name}" 缺少 nodes 或 wires 字段`,
    });
  }

  // 将复合节点转为 GraphIR 后编译
  const graphIr: GraphIr = {
    name: node.name,
    description: node.description,
    input: node.pins.input,
    output: node.pins.output,
    nodes: node.nodes,
    wires: node.wires,
  };

  return compileGraph(graphIr, compositeNames);
}

/** Kahn 拓扑排序 */
function topologicalSort(
  nodeIds: ReadonlySet<string>,
  adjacency: ReadonlyMap<string, Set<string>>,
  inDegreeInput: ReadonlyMap<string, number>,
): Result<string[], string> {
  const inDegree = new Map(inDegreeInput);
  const queue: string[] = [];
  const result: string[] = [];

  // 入度为 0 的节点入队
  for (const id of nodeIds) {
    if ((inDegree.get(id) ?? 0) === 0) {
      queue.push(id);
    }
  }

  // 按字母序保证确定性
  queue.sort();

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    const downstream = adjacency.get(current);
    if (downstream !== undefined) {
      // 收集并排序下游以保证确定性
      const sortedDownstream = [...downstream].toSorted();
      for (const next of sortedDownstream) {
        const newDegree = (inDegree.get(next) ?? 1) - 1;
        inDegree.set(next, newDegree);
        if (newDegree === 0) {
          queue.push(next);
          queue.sort();
        }
      }
    }
  }

  if (result.length !== nodeIds.size) {
    const remaining = [...nodeIds].filter((id) => !result.includes(id));
    return err(remaining.join(", "));
  }

  return ok(result);
}

/** 从拓扑排序结果生成 steps */
function generateSteps(
  sorted: readonly string[],
  adjacency: ReadonlyMap<string, Set<string>>,
  reverseAdj: ReadonlyMap<string, Set<string>>,
  nodeTypeMap: ReadonlyMap<string, string>,
  compositeNames: CompositeNodeNames,
): Step[] {
  const steps: Step[] = [];
  // 记录已经作为 parallel 分支生成的节点，避免重复
  const handledAsParallelBranch = new Set<string>();
  // 记录需要 wait 的节点（多上游汇聚点）
  const needsWait = new Set<string>();

  // 预扫描：标记扇出和汇聚
  for (const nodeId of sorted) {
    const upstreams = reverseAdj.get(nodeId);
    if (upstreams !== undefined && upstreams.size > 1) {
      needsWait.add(nodeId);
    }
  }

  for (const nodeId of sorted) {
    if (handledAsParallelBranch.has(nodeId)) continue;

    const downstream = adjacency.get(nodeId) ?? new Set();
    const upstreams = reverseAdj.get(nodeId) ?? new Set();
    const nodeType = nodeTypeMap.get(nodeId) ?? nodeId;
    const isComposite = compositeNames.has(nodeType);

    // 如果是汇聚点，先插入 wait step
    if (needsWait.has(nodeId)) {
      const waitStepId = `wait-${nodeId}`;
      const waitForIds = [...upstreams].toSorted();
      steps.push({
        id: waitStepId,
        action: "wait",
        waitFor: waitForIds,
        next: nodeId,
      });
    }

    // 确定 action 类型
    const action = isComposite ? "call" : "process";

    // 检查扇出（一个节点有多个下游）
    if (downstream.size > 1) {
      // 当前节点自身的 step
      const parallelStepId = `parallel-after-${nodeId}`;

      const step: Step = {
        id: nodeId,
        action,
        ...(isComposite ? { flowRef: nodeType } : { blockRef: nodeType }),
        next: parallelStepId,
      };
      steps.push(step);

      // 生成 parallel step
      const branchIds = [...downstream].toSorted();
      steps.push({
        id: parallelStepId,
        action: "parallel",
        branches: branchIds,
      });
    } else {
      // 简单链式或末尾节点
      const downstreamArray = [...downstream];
      const nextId = downstreamArray.length > 0 ? downstreamArray[0] : undefined;

      // 如果下一个节点需要 wait，则 next 指向 wait step
      const effectiveNext =
        nextId !== undefined && needsWait.has(nextId) ? `wait-${nextId}` : nextId;

      const step: Step = {
        id: nodeId,
        action,
        ...(isComposite ? { flowRef: nodeType } : { blockRef: nodeType }),
        ...(effectiveNext === undefined ? {} : { next: effectiveNext }),
      };
      steps.push(step);
    }
  }

  return steps;
}

/** 从 wires 生成 dataFlows（排除图级端口 input.x / output.x） */
function generateDataFlows(graph: GraphIr): DataFlow[] {
  return graph.wires
    .filter((w) => {
      const fromNode = w.from.split(".")[0];
      const toNode = w.to.split(".")[0];
      return (
        fromNode !== "input" && fromNode !== "output" && toNode !== "input" && toNode !== "output"
      );
    })
    .map((w) => ({ from: w.from, to: w.to }));
}
