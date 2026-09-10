/** Request-local deadline with deterministic timer/listener disposal. AbortSignal.timeout
 * leaves a live timer until expiry even when a fast RPC has already completed. */
export async function withDeadline<T>(parent: AbortSignal, milliseconds: number, action: (signal: AbortSignal) => Promise<T>): Promise<T> {
 parent.throwIfAborted();
 if (!Number.isSafeInteger(milliseconds) || milliseconds < 1 || milliseconds > 120_000) throw new Error('INVALID_DEADLINE');
 const controller = new AbortController();
 const cancel = () => controller.abort(parent.reason);
 parent.addEventListener('abort', cancel, { once: true });
 const timer = setTimeout(() => controller.abort(new DOMException('Operation timed out', 'TimeoutError')), milliseconds);
 try {
  const value = await action(controller.signal);
  controller.signal.throwIfAborted();
  return value;
 } finally {
  clearTimeout(timer);
  parent.removeEventListener('abort', cancel);
 }
}
