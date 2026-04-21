import { err, type Result } from "../result.js";
import { createRuntimeContext, type ExecutionContext } from "./context.js";
import { selectRuntimePlugins, type RuntimePlugin } from "./plugin.js";
import type { FunctionManifest } from "../function.js";

interface ExecuteFunctionUnitBaseOptions<
  TInput,
  TOutput,
  TError,
  TState extends Record<string, unknown>,
> {
  readonly manifest: FunctionManifest;
  readonly input: TInput;
  readonly plugins?: ReadonlyArray<RuntimePlugin<TInput, TOutput, TError, TState>>;
  readonly fn: (
    context: ExecutionContext<TInput, TState>,
  ) => Result<TOutput, TError> | Promise<Result<TOutput, TError>>;
}

type ExecuteFunctionUnitNoStateOptions<TInput, TOutput, TError> = ExecuteFunctionUnitBaseOptions<
  TInput,
  TOutput,
  TError,
  Record<string, never>
> & {
  readonly state?: Record<string, never>;
};

type ExecuteFunctionUnitWithStateOptions<
  TInput,
  TOutput,
  TError,
  TState extends Record<string, unknown>,
> = ExecuteFunctionUnitBaseOptions<TInput, TOutput, TError, TState> & {
  readonly state: TState;
};

export type ExecuteFunctionUnitOptions<
  TInput,
  TOutput,
  TError,
  TState extends Record<string, unknown> = Record<string, never>,
> = [TState] extends [Record<string, never>]
  ? ExecuteFunctionUnitNoStateOptions<TInput, TOutput, TError>
  : ExecuteFunctionUnitWithStateOptions<TInput, TOutput, TError, TState>;

function toExecutionError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function hasExecutionState<TInput, TOutput, TError, TState extends Record<string, unknown>>(
  options:
    | ExecuteFunctionUnitNoStateOptions<TInput, TOutput, TError>
    | ExecuteFunctionUnitWithStateOptions<TInput, TOutput, TError, TState>,
): options is ExecuteFunctionUnitWithStateOptions<TInput, TOutput, TError, TState> {
  return "state" in options && options.state !== undefined;
}

async function runFunctionUnit<TInput, TOutput, TError, TState extends Record<string, unknown>>(
  context: ExecutionContext<TInput, TState>,
  plugins: ReadonlyArray<RuntimePlugin<TInput, TOutput, TError, TState>>,
  fn: (
    context: ExecutionContext<TInput, TState>,
  ) => Result<TOutput, TError> | Promise<Result<TOutput, TError>>,
): Promise<Result<TOutput, TError | Error>> {
  try {
    for (const plugin of plugins) {
      await plugin.before?.(context);
    }

    const success = await fn(context);

    for (const plugin of plugins) {
      await plugin.after?.(context, success);
    }

    return success;
  } catch (error: unknown) {
    const executionError = toExecutionError(error);

    for (const plugin of plugins) {
      await plugin.error?.(context, executionError);
    }

    return err(executionError);
  }
}

export async function executeFunctionUnit<TInput, TOutput, TError>(
  options: ExecuteFunctionUnitNoStateOptions<TInput, TOutput, TError>,
): Promise<Result<TOutput, TError | Error>>;

export async function executeFunctionUnit<
  TInput,
  TOutput,
  TError,
  TState extends Record<string, unknown> = Record<string, never>,
>(
  options: ExecuteFunctionUnitWithStateOptions<TInput, TOutput, TError, TState>,
): Promise<Result<TOutput, TError | Error>>;

export async function executeFunctionUnit<
  TInput,
  TOutput,
  TError,
  TState extends Record<string, unknown>,
>(
  options:
    | ExecuteFunctionUnitNoStateOptions<TInput, TOutput, TError>
    | ExecuteFunctionUnitWithStateOptions<TInput, TOutput, TError, TState>,
): Promise<Result<TOutput, TError | Error>> {
  if (hasExecutionState(options)) {
    const context = createRuntimeContext({
      manifest: options.manifest,
      input: options.input,
      state: options.state,
    });
    const plugins = selectRuntimePlugins(options.manifest, options.plugins ?? []);

    return runFunctionUnit(context, plugins, options.fn);
  }

  const context = createRuntimeContext({
    manifest: options.manifest,
    input: options.input,
  });
  const plugins = selectRuntimePlugins(options.manifest, options.plugins ?? []);

  return runFunctionUnit(context, plugins, options.fn);
}
