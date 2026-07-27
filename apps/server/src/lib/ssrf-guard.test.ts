import { describe, expect, it } from 'vitest';
import { isForbiddenAddress, isPrivateIPv4, isPrivateIPv6, resolvePinned } from './ssrf-guard.js';

describe('IP classification table', () => {
  const FORBIDDEN_V4 = [
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '100.127.255.255',
    '127.0.0.1',
    '127.8.8.8',
    '169.254.169.254', // cloud metadata
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.170',
    '192.0.2.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.51.100.7',
    '203.0.113.9',
    '224.0.0.1',
    '255.255.255.255',
  ];
  const ALLOWED_V4 = [
    '1.1.1.1',
    '8.8.8.8',
    '93.184.216.34',
    '100.63.0.1',
    '172.32.0.1',
    '11.0.0.1',
  ];

  it.each(FORBIDDEN_V4)('forbids %s', (ip) => {
    expect(isPrivateIPv4(ip)).toBe(true);
  });
  it.each(ALLOWED_V4)('allows %s', (ip) => {
    expect(isPrivateIPv4(ip)).toBe(false);
  });

  const FORBIDDEN_V6 = [
    '::1',
    '::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'febf::1',
    'ff02::1',
    '2001:db8::1',
    '::ffff:127.0.0.1', // mapped loopback
    '::ffff:10.0.0.1', // mapped private
    '::ffff:169.254.169.254', // mapped metadata
    '64:ff9b::10.0.0.1', // NAT64 private
  ];
  const ALLOWED_V6 = ['2606:4700:4700::1111', '2a00:1450:4001:81a::200e', '::ffff:8.8.8.8'];

  it.each(FORBIDDEN_V6)('forbids %s', (ip) => {
    expect(isPrivateIPv6(ip)).toBe(true);
  });
  it.each(ALLOWED_V6)('allows %s', (ip) => {
    expect(isPrivateIPv6(ip)).toBe(false);
  });

  it('rejects garbage', () => {
    expect(isForbiddenAddress('not-an-ip')).toBe(true);
    expect(isForbiddenAddress('999.1.1.1')).toBe(true);
  });
});

describe('resolvePinned', () => {
  it('rejects non-http protocols and credentials', async () => {
    await expect(resolvePinned('ftp://example.com/x')).rejects.toThrow(/protocol/);
    await expect(resolvePinned('file:///etc/passwd')).rejects.toThrow(/protocol/);
    await expect(resolvePinned('https://user:pass@example.com/')).rejects.toThrow(/credentials/);
  });

  it('rejects IP-literal targets in private ranges', async () => {
    await expect(resolvePinned('http://127.0.0.1/x')).rejects.toThrow(/forbidden/);
    await expect(resolvePinned('http://169.254.169.254/latest/meta-data')).rejects.toThrow(
      /forbidden/,
    );
    await expect(resolvePinned('http://[::1]/x')).rejects.toThrow(/forbidden/);
    await expect(resolvePinned('http://[::ffff:10.0.0.1]/x')).rejects.toThrow(/forbidden/);
  });

  it('accepts public IP literals', async () => {
    const { target } = await resolvePinned('http://93.184.216.34/');
    expect(target.address).toBe('93.184.216.34');
  });
});
