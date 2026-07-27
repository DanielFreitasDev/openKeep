import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * SSRF guard for the link-preview fetcher.
 * - Only http/https.
 * - DNS is resolved up front; EVERY returned address must be public.
 * - The caller then connects to the PINNED address (defeats DNS rebinding).
 */

export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true; // this-net, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true; // link-local (cloud metadata!)
  if (a === 172 && b >= 16 && b <= 31) return true; // private 172.16/12
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && parts[1] === 0 && parts[2] === 0) return true; // 192.0.0/24
  if (a === 192 && parts[1] === 0 && parts[2] === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && parts[1] === 51 && parts[2] === 100) return true; // TEST-NET-2
  if (a === 203 && parts[1] === 0 && parts[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function embeddedV4(lower: string): string | null {
  // Dotted form: ::ffff:10.0.0.1
  const dotted = lower.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted?.[1]) return dotted[1];
  // Hex form after URL normalization: ::ffff:a00:1
  const hex = lower.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = Number.parseInt(hex[1]!, 16);
    const lo = Number.parseInt(hex[2]!, 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return null;
}

export function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // IPv4-mapped/translated (::ffff:…, 64:ff9b::/96) — classify the embedded v4.
  if (lower.startsWith('::ffff:') || lower.startsWith('64:ff9b:')) {
    const v4 = embeddedV4(lower);
    if (v4) return isPrivateIPv4(v4);
  }
  if (lower === '::' || lower === '::1') return true; // unspecified, loopback
  if (/^f[cd]/.test(lower)) return true; // ULA fc00::/7
  if (/^fe[89ab]/.test(lower)) return true; // link-local fe80::/10
  if (lower.startsWith('2001:db8')) return true; // documentation
  if (lower.startsWith('ff')) return true; // multicast
  return false;
}

/** True when the address must not be fetched. */
export function isForbiddenAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true;
}

export interface PinnedTarget {
  hostname: string;
  /** The single public address all sockets must connect to. */
  address: string;
  family: 4 | 6;
}

/**
 * Validates the URL and resolves its host to a pinned public address.
 * Throws on any private/reserved resolution (even one — rebinding defense).
 */
export async function resolvePinned(rawUrl: string): Promise<{ url: URL; target: PinnedTarget }> {
  const url = new URL(rawUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`forbidden protocol: ${url.protocol}`);
  }
  if (url.username || url.password) throw new Error('credentials in URL are not allowed');

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    if (isForbiddenAddress(host)) throw new Error(`forbidden address: ${host}`);
    return {
      url,
      target: { hostname: url.hostname, address: host, family: net.isIPv6(host) ? 6 : 4 },
    };
  }

  const results = await dns.lookup(host, { all: true, verbatim: true });
  if (results.length === 0) throw new Error('host did not resolve');
  for (const r of results) {
    if (isForbiddenAddress(r.address)) {
      throw new Error(`forbidden resolution: ${host} -> ${r.address}`);
    }
  }
  const first = results[0]!;
  return {
    url,
    target: { hostname: host, address: first.address, family: first.family as 4 | 6 },
  };
}
