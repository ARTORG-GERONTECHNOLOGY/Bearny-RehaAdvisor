import { urlBase64ToUint8Array } from '@/utils/pushSubscription';

describe('urlBase64ToUint8Array', () => {
  it('decodes a base64url string into a matching Uint8Array', () => {
    // "hello" base64url-encoded, no padding
    const result = urlBase64ToUint8Array('aGVsbG8');
    expect(Array.from(result)).toEqual([104, 101, 108, 108, 111]); // 'h','e','l','l','o'
  });

  it('handles URL-safe characters (- and _)', () => {
    // bytes [0xfb, 0xff] base64url-encode to "-_8" (differs from standard base64 "+/8")
    const result = urlBase64ToUint8Array('-_8');
    expect(Array.from(result)).toEqual([0xfb, 0xff]);
  });

  it('returns an empty array for an empty string', () => {
    const result = urlBase64ToUint8Array('');
    expect(result.length).toBe(0);
  });
});
