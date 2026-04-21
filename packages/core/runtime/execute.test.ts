import { describe, expect, it } from "vitest";
import * as core from "../index.js";
import { ok } from "../result.js";
import { createRuntimeContext } from "./context.js";
import { executeFunctionUnit } from "./execute.js";
import { selectRuntimePlugins, type RuntimePlugin } from "./plugin.js";
import type { FunctionManifest } from "../function.js";
import type { ExecutionContext } from "./context.js";
import type { ExecuteFunctionUnitOptions } from "./execute.js";
import type { ArtifactVersion } from "../version.js";

const REV: ArtifactVersion = {
  rev: 1,
  parentRev: null,
  source: { type: "init" },
  timestamp: "2024-01-01T00:00:00.000Z",
};

interface TestState extends Record<string, unknown> {
  readonly log: string[];
}

type IsOptionalKey<T, K extends keyof T> = Omit<T, K> extends T ? true : false;
type ExpectFalse<T extends false> = T;
type SpecializedStateOptionsMustRequireState = ExpectFalse<
  IsOptionalKey<ExecuteFunctionUnitOptions<string, string, Error, TestState>, "state">
>;

const _specializedStateOptionsMustRequireState: SpecializedStateOptionsMustRequireState = false;

function makeManifest(overrides: Partial<FunctionManifest> = {}): FunctionManifest {
  return {
    id: "packages-core-runtime-execute-function",
    fileRef: "packages-core-runtime-execute-ts",
    exportName: "executeFunctionUnit",
    signature: "executeFunctionUnit(options): Promise<Result<TOutput, TError | Error>>",
    preconditions: ["manifest and function are provided"],
    postconditions: ["returns the governed function result"],
    pluginPolicy: ["trace"],
    revision: REV,
    contentHash: "runtime-function-hash",
    ...overrides,
  };
}

describe("core runtime exports", () => {
  it("loads the lightweight runtime modules", async () => {
    const contextModule = await import("./context.js").catch(() => null);
    const pluginModule = await import("./plugin.js").catch(() => null);
    const executeModule = await import("./execute.js").catch(() => null);
    const runtimeIndexModule = await import("./index.js").catch(() => null);

    expect(contextModule).not.toBeNull();
    expect(pluginModule).not.toBeNull();
    expect(executeModule).not.toBeNull();
    expect(runtimeIndexModule).not.toBeNull();

    expect(typeof contextModule?.createRuntimeContext).toBe("function");
    expect(typeof pluginModule?.selectRuntimePlugins).toBe("function");
    expect(typeof executeModule?.executeFunctionUnit).toBe("function");
    expect(typeof runtimeIndexModule?.executeFunctionUnit).toBe("function");
  });

  it("re-exports runtime APIs from packages/core/index.ts", () => {
    expect(typeof core.createRuntimeContext).toBe("function");
    expect(typeof core.selectRuntimePlugins).toBe("function");
    expect(typeof core.executeFunctionUnit).toBe("function");
  });
});

describe("createRuntimeContext", () => {
  it("derives plugin policy from the manifest and preserves state", () => {
    const state: TestState = { log: [] };
    const manifest = makeManifest({ pluginPolicy: ["trace", "audit"] });

    const context: ExecutionContext<{ filePath: string }, TestState> = createRuntimeContext({
      manifest,
      input: { filePath: "packages/core/index.ts" },
      state,
    });

    expect(context.manifest).toBe(manifest);
    expect(context.pluginPolicy).toEqual(["trace", "audit"]);
    expect(context.state).toBe(state);
    expect(context.input).toEqual({ filePath: "packages/core/index.ts" });
  });
});

describe("selectRuntimePlugins", () => {
  it("keeps only plugins that are allowed by function policy", () => {
    const manifest = makeManifest({ pluginPolicy: ["trace", "audit"] });
    const plugins: Array<RuntimePlugin<string, string, Error, TestState>> = [
      { name: "trace" },
      { name: "metrics" },
      { name: "audit" },
    ];

    const selected = selectRuntimePlugins(manifest, plugins);

    expect(selected.map((plugin) => plugin.name)).toEqual(["trace", "audit"]);
  });
});

describe("executeFunctionUnit", () => {
  it("runs policy-selected plugins around the governed function", async () => {
    const state: TestState = { log: [] };
    const manifest = makeManifest({ pluginPolicy: ["trace"] });
    const plugins: Array<RuntimePlugin<string, string, Error, TestState>> = [
      {
        name: "trace",
        before(context) {
          context.state.log.push(`before:${context.input}`);
        },
        after(context, result) {
          context.state.log.push(
            result.ok ? `after:${result.value}` : `after-error:${result.error}`,
          );
        },
      },
      {
        name: "metrics",
        before(context) {
          context.state.log.push(`metrics:${context.input}`);
        },
      },
    ];

    const result = await executeFunctionUnit<string, string, Error, TestState>({
      manifest,
      input: "Ada",
      state,
      plugins,
      fn(context) {
        context.state.log.push(`fn:${context.input}`);
        return ok(`hello ${context.input}`);
      },
    });

    expect(result).toEqual(ok("hello Ada"));
    expect(state.log).toEqual(["before:Ada", "fn:Ada", "after:hello Ada"]);
  });

  it("runs the dedicated plugin error phase for thrown failures", async () => {
    const state: TestState = { log: [] };
    const manifest = makeManifest({ pluginPolicy: ["audit"] });
    const plugins: Array<RuntimePlugin<string, string, Error, TestState>> = [
      {
        name: "audit",
        after(context, result) {
          context.state.log.push(result.ok ? "after:ok" : "after:unexpected-error");
        },
        error(context, error) {
          context.state.log.push(`error:${error.message}`);
        },
      },
    ];

    const result = await executeFunctionUnit<string, string, Error, TestState>({
      manifest,
      input: "Ada",
      state,
      plugins,
      fn(context) {
        context.state.log.push(`fn:${context.input}`);
        throw new Error("boom");
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected Err result");
    }
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe("boom");
    expect(state.log).toEqual(["fn:Ada", "error:boom"]);
  });

  it("routes before-hook failures through the runtime error phase", async () => {
    const state: TestState = { log: [] };
    const manifest = makeManifest({ pluginPolicy: ["audit"] });
    const plugins: Array<RuntimePlugin<string, string, Error, TestState>> = [
      {
        name: "audit",
        before(context) {
          context.state.log.push(`before:${context.input}`);
          throw new Error("before boom");
        },
        error(context, error) {
          context.state.log.push(`error:${error.message}`);
        },
      },
    ];

    const result = await executeFunctionUnit<string, string, Error, TestState>({
      manifest,
      input: "Ada",
      state,
      plugins,
      fn(context) {
        context.state.log.push(`fn:${context.input}`);
        return ok(`hello ${context.input}`);
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected Err result");
    }
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe("before boom");
    expect(state.log).toEqual(["before:Ada", "error:before boom"]);
  });
});
