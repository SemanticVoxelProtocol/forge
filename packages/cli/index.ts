#!/usr/bin/env node
// forge CLI — SVP 工具链的命令行入口

import { Command } from "commander";
import { VERSION } from "../core/version.js";
import { registerChangeset } from "./commands/changeset.js";
import { registerCheck } from "./commands/check.js";
import { registerCompilePlan } from "./commands/compile-plan.js";
import { registerDocs } from "./commands/docs.js";
import { registerFix } from "./commands/fix.js";
import { registerInit } from "./commands/init.js";
import { registerLink } from "./commands/link.js";
import { registerPrompt } from "./commands/prompt.js";
import { registerRehash } from "./commands/rehash.js";
import { registerView } from "./commands/view.js";

/** 创建并配置 CLI 程序 */
export function createCLI(): Command {
  const program = new Command()
    .name("forge")
    .description("SVP — Semantic Voxel Protocol toolchain")
    .version(VERSION);

  registerChangeset(program);
  registerCheck(program);
  registerCompilePlan(program);
  registerDocs(program);
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
