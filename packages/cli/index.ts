#!/usr/bin/env node
// svp CLI — SVP 工具链的命令行入口

import { Command } from "commander";
import { registerCheck } from "./commands/check.js";
import { registerCompileBlueprint } from "./commands/compile-blueprint.js";
import { registerCompilePlan } from "./commands/compile-plan.js";
import { registerCompile } from "./commands/compile.js";
import { registerInit } from "./commands/init.js";
import { registerLink } from "./commands/link.js";
import { registerPrompt } from "./commands/prompt.js";
import { registerRehash } from "./commands/rehash.js";
import { registerView } from "./commands/view.js";
import type { CodeCLIAdapter } from "../core/adapter.js";

/** 创建并配置 CLI 程序（需要传入 adapter） */
export function createCLI(adapter: CodeCLIAdapter): Command {
  const program = new Command()
    .name("svp")
    .description("SVP — Semantic Voxel Protocol toolchain")
    .version("0.1.0");

  registerCheck(program);
  registerCompile(program, adapter);
  registerCompileBlueprint(program);
  registerCompilePlan(program);
  registerInit(program);
  registerLink(program);
  registerRehash(program);
  registerView(program);
  registerPrompt(program);

  return program;
}

// 直接执行时使用空 adapter（由宿主 CLI 注入真实实现）
const stubAdapter: CodeCLIAdapter = {
  name: "stub",
  createSkillRegistry: () => new Map(),
};

const program = createCLI(stubAdapter);
program.parse();
