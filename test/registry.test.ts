import { describe, expect, it } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { TOOLS, runTool } from '../src/tools/registry.js';
import { visibleTools } from '../src/server.js';
import { openApiDocument } from '../src/openapi.js';
import { DEFAULT_POLICY } from '../src/policy.js';

const ctx = { principal: {}, quoteSecret: 's', connectHint: 'connect first' };

describe('tool registry', () => {
  it('has unique snake_case names and complete metadata', () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-z][a-z_]+$/);
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.title).toBeTruthy();
      expect(typeof t.annotations.readOnlyHint).toBe('boolean');
    }
  });

  it('marks exactly the position-changing tools as destructive', () => {
    const destructive = TOOLS.filter((t) => t.annotations.destructiveHint).map((t) => t.name).sort();
    expect(destructive).toEqual(['close_positions', 'open_position']);
  });

  it('only lists trading tools when a session exists', () => {
    const anon = visibleTools(ctx).map((t) => t.name);
    expect(anon).not.toContain('open_position');
    const key = generatePrivateKey();
    const addr = privateKeyToAccount(key).address;
    const trading = visibleTools({ ...ctx, principal: { wallet: addr, session: { wallet: addr, sessionKey: key, sessionAddress: addr, expiry: Date.now() / 1000 + 3600 }, policy: DEFAULT_POLICY } }).map((t) => t.name);
    expect(trading).toEqual(expect.arrayContaining(['preview_trade', 'open_position', 'close_positions']));
  });

  it('rejects invalid arguments before doing any work', async () => {
    await expect(runTool('calculate_position', { market: 'DOGE' }, ctx)).rejects.toMatchObject({ code: 'invalid_arguments' });
    await expect(runTool('no_such_tool', {}, ctx)).rejects.toThrow();
  });

  it('refuses trading without a session', async () => {
    await expect(runTool('open_position', { market: 'BTC', side: 'long', marginUsd: 10, leverage: 10 }, ctx)).rejects.toThrow();
  });
});

describe('openapi', () => {
  it('exposes every tool, with trading behind OAuth and flagged as consequential', () => {
    const doc = openApiDocument('https://example.com') as { paths: Record<string, { post: Record<string, unknown> }> };
    for (const t of TOOLS) expect(doc.paths[`/api/v1/me/tools/${t.name}`]).toBeTruthy();
    expect(doc.paths['/api/v1/tools/open_position']).toBeUndefined();
    expect(doc.paths['/api/v1/me/tools/open_position'].post['x-openai-isConsequential']).toBe(true);
    expect(doc.paths['/api/v1/tools/get_markets'].post.security).toEqual([]);
  });
});
