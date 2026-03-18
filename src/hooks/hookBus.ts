import type { HookContext, HookEvent, HookPayloadMap } from "../types.js";

type HookHandler<T extends HookEvent> = (
  payload: HookPayloadMap[T],
  context: HookContext,
) => Promise<void>;

export class HookBus {
  private readonly handlers: {
    [K in HookEvent]?: Array<HookHandler<K>>;
  } = {};

  on<T extends HookEvent>(event: T, handler: HookHandler<T>): void {
    const current = this.handlers[event] as Array<HookHandler<T>> | undefined;
    this.handlers[event] = [...(current ?? []), handler] as Array<HookHandler<HookEvent>>;
  }

  async emit<T extends HookEvent>(
    event: T,
    payload: HookPayloadMap[T],
    context: HookContext,
  ): Promise<void> {
    const handlers = (this.handlers[event] ?? []) as Array<HookHandler<T>>;

    for (const handler of handlers) {
      try {
        await handler(payload, context);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`[hook:${event}] non-blocking error: ${message}\n`);
      }
    }
  }
}
