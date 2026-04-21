import type { FunctionManifest } from "../function.js";

export interface ExecutionContext<
  TInput,
  TState extends Record<string, unknown> = Record<string, never>,
> {
  readonly manifest: FunctionManifest;
  readonly input: TInput;
  readonly pluginPolicy: readonly string[];
  readonly state: TState;
}

export function createRuntimeContext<TInput>(options: {
  readonly manifest: FunctionManifest;
  readonly input: TInput;
}): ExecutionContext<TInput>;
export function createRuntimeContext<TInput, TState extends Record<string, unknown>>(options: {
  readonly manifest: FunctionManifest;
  readonly input: TInput;
  readonly state: TState;
}): ExecutionContext<TInput, TState>;
export function createRuntimeContext<TInput, TState extends Record<string, unknown>>(options: {
  readonly manifest: FunctionManifest;
  readonly input: TInput;
  readonly state?: TState;
}): ExecutionContext<TInput, TState | Record<string, never>> {
  return {
    manifest: options.manifest,
    input: options.input,
    pluginPolicy: options.manifest.pluginPolicy,
    state: options.state ?? {},
  };
}
