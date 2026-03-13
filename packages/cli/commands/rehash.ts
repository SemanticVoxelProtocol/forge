// svp rehash — 重算 contentHash + 更新 revision
// AI 写完 JSON 后运行，自动修正 hash

import {
  listL2,
  listL3,
  listL4,
  readL2,
  readL3,
  readL4,
  readL5,
  writeL2,
  writeL3,
  writeL4,
  writeL5,
} from "../../core/index.js";
import { rehashL2, rehashL3, rehashL4, rehashL5 } from "../../skills/index.js";
import type { RehashResult } from "../../skills/index.js";
import type { Command } from "commander";

function formatResult(result: RehashResult): string {
  if (!result.changed) return `  SKIP ${result.layer}/${result.id} (unchanged)`;
  const oldShort = result.oldHash.slice(0, 8);
  const newShort = result.newHash.slice(0, 8);
  return `  OK   ${result.layer}/${result.id}: ${oldShort} -> ${newShort}`;
}

/** 注册 svp rehash 子命令 */
export function registerRehash(program: Command): void {
  program
    .command("rehash")
    .description("Recompute contentHash and bump revision for .svp/ artifacts")
    .argument("[target]", "Target: l5, l4, l3, l2, l4/<id>, l3/<id>, l2/<id>")
    .option("-r, --root <path>", "Project root directory", ".")
    .option("--json", "Output as JSON")
    .action(async (target: string | undefined, options: { root: string; json: boolean }) => {
      const results: RehashResult[] = [];
      const root = options.root;

      // 解析 target
      const parsed = parseTarget(target);

      // L5
      if (parsed.layers.includes("l5")) {
        const l5 = await readL5(root);
        if (l5 !== null) {
          const { data, result } = rehashL5(l5);
          results.push(result);
          if (result.changed) await writeL5(root, data);
        }
      }

      // L4
      if (parsed.layers.includes("l4")) {
        const ids = parsed.id === undefined ? await listL4(root) : [parsed.id];
        for (const id of ids) {
          const flow = await readL4(root, id);
          if (flow !== null) {
            const { data, result } = rehashL4(flow);
            results.push(result);
            if (result.changed) await writeL4(root, data);
          }
        }
      }

      // L3
      if (parsed.layers.includes("l3")) {
        const ids = parsed.id === undefined ? await listL3(root) : [parsed.id];
        for (const id of ids) {
          const block = await readL3(root, id);
          if (block !== null) {
            const { data, result } = rehashL3(block);
            results.push(result);
            if (result.changed) await writeL3(root, data);
          }
        }
      }

      // L2
      if (parsed.layers.includes("l2")) {
        const ids = parsed.id === undefined ? await listL2(root) : [parsed.id];
        for (const id of ids) {
          const cb = await readL2(root, id);
          if (cb !== null) {
            const { data, result } = rehashL2(cb);
            results.push(result);
            if (result.changed) await writeL2(root, data);
          }
        }
      }

      // 输出
      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      if (results.length === 0) {
        console.log("No artifacts found to rehash.");
        return;
      }

      const changed = results.filter((r) => r.changed);
      console.log(
        `svp rehash — ${String(results.length)} artifact(s) checked, ${String(changed.length)} updated`,
      );
      console.log();
      for (const r of results) {
        console.log(formatResult(r));
      }
    });
}

type Layer = "l2" | "l3" | "l4" | "l5";
const ALL_LAYERS: readonly Layer[] = ["l5", "l4", "l3", "l2"];

function parseTarget(target: string | undefined): { layers: readonly Layer[]; id?: string } {
  if (target === undefined) return { layers: ALL_LAYERS };

  // "l5", "l4", "l3", "l2" — 整层
  if (target === "l5" || target === "l4" || target === "l3" || target === "l2") {
    return { layers: [target] };
  }

  // "l4/flow-id", "l3/block-id", "l2/block-id" — 指定实体
  const match = /^(l[234])\/(.+)$/.exec(target);
  if (match !== null) {
    return { layers: [match[1] as Layer], id: match[2] };
  }

  console.error(`Invalid target: ${target}. Use: l5, l4, l3, l2, l4/<id>, l3/<id>, l2/<id>`);
  process.exitCode = 1;
  return { layers: [] };
}
