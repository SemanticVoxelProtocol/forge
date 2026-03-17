#!/usr/bin/env node
// svp CLI — SVP 工具链的命令行入口

import { Command } from "commander";
import { registerCheck } from "./commands/check.js";
import { registerFix } from "./commands/fix.js";
import { registerCompilePlan } from "./commands/compile-plan.js";
import { registerInit } from "./commands/init.js";
import { registerLink } from "./commands/link.js";
import { registerPrompt } from "./commands/prompt.js";
import { registerRehash } from "./commands/rehash.js";
import { registerView } from "./commands/view.js";

/** 创建并配置 CLI 程序 */
export function createCLI(): Command {
  const program = new Command()
    .name("svp")
    .description("SVP — Semantic Voxel Protocol toolchain")
    .version("0.1.0");

  registerCheck(program);
  registerCompilePlan(program);
  registerInit(program);
  registerLink(program);
  registerRehash(program);
  registerView(program);
  registerPrompt(program);
  registerFix(program);

  return program;
}

const program = createCLI();
program.parse();
