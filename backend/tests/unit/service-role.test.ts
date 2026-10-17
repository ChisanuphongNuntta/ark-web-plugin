import { afterEach, describe, expect, it } from 'vitest';
import { getServiceRole, servesPlugin, servesWeb } from '../../src/config/serviceRole.js';

describe('service role', () => {
  const original = process.env.SERVICE_ROLE;
  afterEach(() => {
    if (original === undefined) delete process.env.SERVICE_ROLE;
    else process.env.SERVICE_ROLE = original;
  });

  it('defaults to all', () => {
    delete process.env.SERVICE_ROLE;
    expect(getServiceRole()).toBe('all');
  });

  it('splits web and plugin-gateway responsibilities', () => {
    expect(servesWeb('web')).toBe(true);
    expect(servesPlugin('web')).toBe(false);
    expect(servesWeb('plugin-gateway')).toBe(false);
    expect(servesPlugin('plugin-gateway')).toBe(true);
    expect(servesWeb('all') && servesPlugin('all')).toBe(true);
  });

  it('rejects unknown roles instead of silently serving everything', () => {
    process.env.SERVICE_ROLE = 'plugin';
    expect(() => getServiceRole()).toThrow(/Invalid SERVICE_ROLE/);
  });
});
