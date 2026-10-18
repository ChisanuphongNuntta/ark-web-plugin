import { AsyncLocalStorage } from 'node:async_hooks';

// Post-commit hooks for realtime notifications.
//
// Realtime events must only leave the process AFTER the database transaction that produced
// them has committed (a rolled-back purchase must never tell the browser its balance moved).
// Most wallet/order writes happen inside a caller-owned `prisma.$transaction(async (tx) => …)`,
// so the code that knows "a user's balance changed" (walletService.post) cannot see the commit.
//
// installAfterCommitHooks() wraps the interactive form of `prisma.$transaction` so every
// callback runs inside an AsyncLocalStorage scope. `afterCommit(cb)` called anywhere inside that
// scope is queued and executed only when the transaction promise resolves; a failed/retried
// attempt discards its queue. Outside any transaction `afterCommit` runs on the next tick.

type Scope = { callbacks: Array<() => void | Promise<void>> };

const storage = new AsyncLocalStorage<Scope>();

function runCallbacks(callbacks: Scope['callbacks']) {
  for (const callback of callbacks) {
    try {
      const result = callback();
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch((error) => console.error('[realtime] afterCommit hook failed:', error));
      }
    } catch (error) {
      console.error('[realtime] afterCommit hook failed:', error);
    }
  }
}

export function afterCommit(callback: () => void | Promise<void>): void {
  const scope = storage.getStore();
  if (scope) {
    scope.callbacks.push(callback);
    return;
  }
  setImmediate(() => runCallbacks([callback]));
}

/** True while executing inside a wrapped interactive transaction (exposed for tests). */
export function inTransactionScope(): boolean {
  return storage.getStore() !== undefined;
}

/**
 * Run `fn` in a fresh post-commit scope; queued callbacks fire only if `fn` resolves.
 * Used by the $transaction wrapper and directly by tests.
 */
export async function withAfterCommitScope<T>(fn: () => Promise<T>): Promise<T> {
  const outer = storage.getStore();
  // A nested call (should not happen with Prisma, but be safe) shares the outer queue so
  // callbacks still wait for the OUTERMOST commit.
  if (outer) return fn();
  const scope: Scope = { callbacks: [] };
  const result = await storage.run(scope, fn);
  runCallbacks(scope.callbacks);
  return result;
}

const INSTALLED = Symbol.for('iris.realtime.afterCommitInstalled');

export function installAfterCommitHooks(client: { $transaction: (...args: any[]) => any }): void {
  const target = client as any;
  if (target[INSTALLED]) return;
  const original = target.$transaction.bind(client);
  target.$transaction = (arg: unknown, ...rest: unknown[]) => {
    // Array (batch) form has no callback to scope; it commits atomically and nothing in it
    // can register hooks.
    if (typeof arg !== 'function') return original(arg, ...rest);
    return withAfterCommitScope(() => original(arg, ...rest));
  };
  target[INSTALLED] = true;
}
