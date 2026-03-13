// init.ts 单元测试

import { mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { init } from "./init.js";
import { readL5 } from "./store.js";

describe("init", () => {
  let testRoot: string;

  beforeEach(async () => {
    testRoot = path.join(
      tmpdir(),
      `svp-init-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`,
    );
    await mkdir(testRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it("creates .svp/ directory structure", async () => {
    const result = await init(testRoot, { name: "My Project" });

    expect(result.created).toBe(true);

    // 验证目录结构
    const svpStat = await stat(path.join(testRoot, ".svp"));
    expect(svpStat.isDirectory()).toBe(true);

    for (const sub of ["l2", "l3", "l4"]) {
      const subStat = await stat(path.join(testRoot, ".svp", sub));
      expect(subStat.isDirectory()).toBe(true);
    }
  });

  it("creates L5 blueprint with defaults", async () => {
    const result = await init(testRoot, { name: "My Project" });

    const l5 = result.l5!;
    expect(l5.id).toBe("my-project");
    expect(l5.name).toBe("My Project");
    expect(l5.version).toBe("0.1.0");
    expect(l5.intent).toBe("");
    expect(l5.contentHash).toBeTruthy();

    // 版本追踪
    expect(l5.revision.rev).toBe(1);
    expect(l5.revision.parentRev).toBeNull();
    expect(l5.revision.source.type).toBe("init");
    expect(l5.revision.timestamp).toBeTruthy();

    // 验证持久化
    const loaded = await readL5(testRoot);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("My Project");
  });

  it("accepts custom version and intent", async () => {
    const result = await init(testRoot, {
      name: "Order System",
      version: "1.0.0",
      intent: "Manage e-commerce orders",
    });

    const l5 = result.l5!;
    expect(l5.version).toBe("1.0.0");
    expect(l5.intent).toBe("Manage e-commerce orders");
    expect(l5.id).toBe("order-system");
  });

  it("returns created=false if .svp/ already exists", async () => {
    await init(testRoot, { name: "First" });
    const second = await init(testRoot, { name: "Second" });

    expect(second.created).toBe(false);

    // 原始 L5 不应被覆盖
    const loaded = await readL5(testRoot);
    expect(loaded!.name).toBe("First");
  });

  it("slugifies name correctly", async () => {
    const result = await init(testRoot, { name: "  Hello World! 123  " });
    expect(result.l5!.id).toBe("hello-world-123");
  });
});
