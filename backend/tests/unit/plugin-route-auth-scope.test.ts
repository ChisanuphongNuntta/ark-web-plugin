import { describe, expect, it } from 'vitest';
import pluginRouter from '../../src/routes/plugin.routes.js';

type RouterLayer = {
  route?: {
    path: string;
    stack: Array<{ handle?: { name?: string } }>;
  };
  handle?: { name?: string };
};

const layers = (pluginRouter as unknown as { stack: RouterLayer[] }).stack;

describe('plugin route authentication scope', () => {
  it('does not install flexible authentication as a catch-all middleware', () => {
    const catchAllFlexibleAuth = layers.filter(
      (layer) => !layer.route && layer.handle?.name === 'authenticatePluginFlexible',
    );

    expect(catchAllFlexibleAuth).toHaveLength(0);
  });

  it.each([
    '/verify',
    '/orders/pending',
    '/orders/:orderId/deliver',
    '/orders/:orderId/fail',
    '/stats',
    '/player/:steamId',
  ])('keeps flexible authentication on legacy route %s', (path) => {
    const routeLayer = layers.find((layer) => layer.route?.path === path);

    expect(routeLayer).toBeDefined();
    expect(
      routeLayer!.route!.stack.some(
        (layer) => layer.handle?.name === 'authenticatePluginFlexible',
      ),
    ).toBe(true);
  });
});
