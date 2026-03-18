// forge view — 虚拟文件树渲染命令
// 读取 .svp/ 目录下的数据，渲染为 AI 友好的文本视图

import {
  listL2,
  listL3,
  listL4,
  readL2,
  readL3,
  readL4,
  readL5,
  viewL2Detail,
  viewL2Overview,
  viewL3Detail,
  viewL3Overview,
  viewL4Detail,
  viewL4Overview,
  viewL5Overview,
} from "../../core/index.js";
import type { L2CodeBlock, L3Block, L4Artifact, L5Blueprint } from "../../core/index.js";
import type { Command } from "commander";

/** 从 .svp/ 加载所有层数据 */
async function loadAll(root: string): Promise<{
  l5: L5Blueprint | undefined;
  l4Flows: L4Artifact[];
  l3Blocks: L3Block[];
  l2Blocks: L2CodeBlock[];
}> {
  const l5 = (await readL5(root)) ?? undefined;

  const l4Ids = await listL4(root);
  const l4Flows: L4Artifact[] = [];
  for (const id of l4Ids) {
    const l4 = await readL4(root, id);
    if (l4 !== null) l4Flows.push(l4);
  }

  const l3Ids = await listL3(root);
  const l3Blocks: L3Block[] = [];
  for (const id of l3Ids) {
    const block = await readL3(root, id);
    if (block !== null) l3Blocks.push(block);
  }

  const l2Ids = await listL2(root);
  const l2Blocks: L2CodeBlock[] = [];
  for (const id of l2Ids) {
    const cb = await readL2(root, id);
    if (cb !== null) l2Blocks.push(cb);
  }

  return { l5, l4Flows, l3Blocks, l2Blocks };
}

/** 注册 forge view 子命令 */
export function registerView(program: Command): void {
  const view = program
    .command("view")
    .description("Render virtual file tree views of .svp/ data")
    .option("-r, --root <path>", "Project root directory", ".");

  // forge view l5
  view
    .command("l5")
    .description("L5 Blueprint overview")
    .action(async () => {
      const root = view.opts<{ root: string }>().root;
      const l5 = (await readL5(root)) ?? undefined;
      if (l5 === undefined) {
        console.log("No L5 blueprint found. Run `forge init` to create one.");
        return;
      }
      console.log(viewL5Overview(l5));
    });

  // forge view l4
  view
    .command("l4 [id]")
    .description("L4 Logic Chains — overview or detail for a specific flow")
    .action(async (id?: string) => {
      const root = view.opts<{ root: string }>().root;
      if (id === undefined) {
        const l4Ids = await listL4(root);
        const flows: L4Artifact[] = [];
        for (const fid of l4Ids) {
          const l4 = await readL4(root, fid);
          if (l4 !== null) flows.push(l4);
        }
        if (flows.length === 0) {
          console.log("No L4 flows found.");
          return;
        }
        console.log(viewL4Overview(flows));
        return;
      }

      // detail view
      const flow = await readL4(root, id);
      if (flow === null) {
        console.error(`L4 flow "${id}" not found.`);
        process.exitCode = 1;
        return;
      }

      const { l5, l3Blocks } = await loadAll(root);
      console.log(viewL4Detail(flow, l3Blocks, l5));
    });

  // forge view l3
  view
    .command("l3 [id]")
    .description("L3 Logic Blocks — overview or detail for a specific block")
    .action(async (id?: string) => {
      const root = view.opts<{ root: string }>().root;
      if (id === undefined) {
        const l3Ids = await listL3(root);
        const blocks: L3Block[] = [];
        for (const bid of l3Ids) {
          const block = await readL3(root, bid);
          if (block !== null) blocks.push(block);
        }
        if (blocks.length === 0) {
          console.log("No L3 blocks found.");
          return;
        }
        console.log(viewL3Overview(blocks));
        return;
      }

      // detail view
      const block = await readL3(root, id);
      if (block === null) {
        console.error(`L3 block "${id}" not found.`);
        process.exitCode = 1;
        return;
      }

      const { l4Flows, l2Blocks } = await loadAll(root);
      console.log(viewL3Detail(block, l4Flows, l2Blocks));
    });

  // forge view l2
  view
    .command("l2 [id]")
    .description("L2 Code Blocks — overview or detail for a specific block")
    .action(async (id?: string) => {
      const root = view.opts<{ root: string }>().root;
      if (id === undefined) {
        const { l2Blocks, l3Blocks } = await loadAll(root);
        if (l2Blocks.length === 0) {
          console.log("No L2 code blocks found.");
          return;
        }
        console.log(viewL2Overview(l2Blocks, l3Blocks));
        return;
      }

      // detail view
      const cb = await readL2(root, id);
      if (cb === null) {
        console.error(`L2 code block "${id}" not found.`);
        process.exitCode = 1;
        return;
      }

      const l3Ids = await listL3(root);
      const l3Blocks: L3Block[] = [];
      for (const bid of l3Ids) {
        const block = await readL3(root, bid);
        if (block !== null) l3Blocks.push(block);
      }
      console.log(viewL2Detail(cb, l3Blocks));
    });
}
