import type { FunctionManifest } from "../function.js";
import type { Result } from "../result.js";
import type { ExecutionContext } from "./context.js";

export interface RuntimePlugin<
  TInput,
  TOutput,
  TError,
  TState extends Record<string, unknown> = Record<string, never>,
> {
  readonly name: string;
  readonly before?: (context: ExecutionContext<TInput, TState>) => void | Promise<void>;
  readonly after?: (
    context: ExecutionContext<TInput, TState>,
    result: Result<TOutput, TError>,
  ) => void | Promise<void>;
  readonly error?: (
    context: ExecutionContext<TInput, TState>,
    error: Error,
  ) => void | Promise<void>;
}

export function selectRuntimePlugins<
  TInput,
  TOutput,
  TError,
  TState extends Record<string, unknown>,
>(
  manifest: Pick<FunctionManifest, "pluginPolicy">,
  plugins: ReadonlyArray<RuntimePlugin<TInput, TOutput, TError, TState>>,
): ReadonlyArray<RuntimePlugin<TInput, TOutput, TError, TState>> {
  const allowed = new Set(manifest.pluginPolicy);
  return plugins.filter((plugin) => allowed.has(plugin.name));
}
