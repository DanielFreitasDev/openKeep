import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

const RPC_ACCEPT = 'application/json, text/event-stream';
const REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

describe('oauth 2.1 authorization server', () => {
  let t: TestApp;
  let cookie: string;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.signUp('oauth-user@example.com', 'OAuth User');
  });
  afterAll(async () => {
    await t.close();
  });

  /** Dynamic client registration — unauthenticated, as the MCP flow requires. */
  const register = async (name = 'Test Connector') => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/mcp/register',
      payload: {
        redirect_uris: [REDIRECT_URI],
        client_name: name,
        token_endpoint_auth_method: 'none',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().client_id as string;
  };

  /** Runs authorize → consent → token and returns the access token. */
  const authorize = async (clientId: string) => {
    const authorized = await t.app.inject({
      method: 'GET',
      url: '/api/auth/mcp/authorize',
      headers: { cookie },
      query: {
        client_id: clientId,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        code_challenge: CHALLENGE,
        code_challenge_method: 'S256',
        scope: 'openid offline_access',
        state: 'st',
      },
    });
    expect(authorized.statusCode).toBe(302);
    const consentUrl = new URL(authorized.headers.location as string, 'http://localhost');
    const consentCode = consentUrl.searchParams.get('consent_code');
    expect(consentCode).toBeTruthy();

    const consented = await t.app.inject({
      method: 'POST',
      url: '/api/auth/oauth2/consent',
      headers: { cookie, origin: 'http://localhost:5173' },
      payload: { accept: true, consent_code: consentCode },
    });
    expect(consented.statusCode).toBe(200);
    const code = new URL(consented.json().redirectURI as string).searchParams.get('code');

    const token = await t.app.inject({
      method: 'POST',
      url: '/api/auth/mcp/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code ?? '',
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        code_verifier: VERIFIER,
      }).toString(),
    });
    expect(token.statusCode).toBe(200);
    return token.json().access_token as string;
  };

  const rpc = (body: unknown, headers: Record<string, string>) =>
    t.app.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: { accept: RPC_ACCEPT, 'content-type': 'application/json', ...headers },
      payload: body as Record<string, unknown>,
    });

  it('publishes discovery documents at the origin root', async () => {
    const as = await t.app.inject({
      method: 'GET',
      url: '/.well-known/oauth-authorization-server',
    });
    expect(as.statusCode).toBe(200);
    expect(as.json().code_challenge_methods_supported).toContain('S256');
    expect(as.json().registration_endpoint).toContain('/api/auth/mcp/register');

    // Both the bare and the resource-suffixed form (RFC 9728) must answer.
    for (const url of [
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/api/mcp',
    ]) {
      const prm = await t.app.inject({ method: 'GET', url });
      expect(prm.statusCode).toBe(200);
      expect(prm.json().resource).toContain('/api/mcp');
      expect(prm.json().authorization_servers).toHaveLength(1);
    }
  });

  it('points an unauthenticated MCP request at the protected-resource document', async () => {
    const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, {});
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toContain(
      'resource_metadata="http://localhost:5173/.well-known/oauth-protected-resource/api/mcp"',
    );
  });

  it('carries a registered client through the full flow to a working MCP session', async () => {
    const clientId = await register();
    const accessToken = await authorize(clientId);

    const listed = await rpc(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { authorization: `Bearer ${accessToken}` },
    );
    expect(listed.statusCode).toBe(200);
    expect(listed.body).toContain('create_note');

    // The grant must survive the trip through app.inject into the REST layer,
    // which is where requireAuth re-resolves it.
    const created = await rpc(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'create_note', arguments: { title: 'Via OAuth' } },
      },
      { authorization: `Bearer ${accessToken}` },
    );
    expect(created.statusCode).toBe(200);
    expect(created.body).toContain('Via OAuth');
  });

  it('forces a consent step even when the client does not ask for one', async () => {
    // Registration is open, so a crafted authorize link must never mint a code
    // silently for a signed-in victim.
    const clientId = await register('Silent Connector');
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/auth/mcp/authorize',
      headers: { cookie },
      query: {
        client_id: clientId,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        code_challenge: CHALLENGE,
        code_challenge_method: 'S256',
      },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('/oauth/consent');
    expect(res.headers.location).not.toContain(REDIRECT_URI);
  });

  it('rejects a code exchanged without the matching PKCE verifier', async () => {
    const clientId = await register('PKCE Connector');
    const authorized = await t.app.inject({
      method: 'GET',
      url: '/api/auth/mcp/authorize',
      headers: { cookie },
      query: {
        client_id: clientId,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        code_challenge: CHALLENGE,
        code_challenge_method: 'S256',
      },
    });
    const consentCode = new URL(
      authorized.headers.location as string,
      'http://localhost',
    ).searchParams.get('consent_code');
    const consented = await t.app.inject({
      method: 'POST',
      url: '/api/auth/oauth2/consent',
      headers: { cookie, origin: 'http://localhost:5173' },
      payload: { accept: true, consent_code: consentCode },
    });
    const code = new URL(consented.json().redirectURI as string).searchParams.get('code');

    const token = await t.app.inject({
      method: 'POST',
      url: '/api/auth/mcp/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code ?? '',
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        code_verifier: 'not-the-verifier-that-was-committed-to-at-all',
      }).toString(),
    });
    expect(token.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('keeps OAuth tokens out of the session-only surfaces', async () => {
    const accessToken = await authorize(await register('Nosy Connector'));
    for (const url of ['/api/tokens', '/api/oauth/connections']) {
      const res = await t.app.inject({
        method: 'GET',
        url,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(res.statusCode).toBe(403);
    }
  });

  it('lists a connector and cuts its access the moment it is disconnected', async () => {
    const clientId = await register('Disposable Connector');
    const accessToken = await authorize(clientId);

    const listed = await t.app.inject({
      method: 'GET',
      url: '/api/oauth/connections',
      headers: { cookie },
    });
    expect(listed.statusCode).toBe(200);
    const entry = listed.json().find((c: { clientId: string }) => c.clientId === clientId);
    expect(entry).toMatchObject({ name: 'Disposable Connector', redirectHosts: ['claude.ai'] });

    const revoked = await t.app.inject({
      method: 'DELETE',
      url: `/api/oauth/connections/${clientId}`,
      headers: { cookie },
    });
    expect(revoked.statusCode).toBe(204);

    // Immediate, not "when the hour-long token expires".
    const after = await rpc(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { authorization: `Bearer ${accessToken}` },
    );
    expect(after.statusCode).toBe(401);
  });
});
