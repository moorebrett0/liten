'use strict';
// Crockford's base32, ULID variant.
const crypto = require('crypto');
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RAND_BYTES = new Uint8Array(16);

function encode(n, len) {
    let s = '';
    for (let i = len - 1; i >= 0; i--) {
        s = ALPHABET[Number(n & 31n)] + s;
        n >>= 5n;
    }
    return s;
}

function newRequestId() {
    const t = BigInt(Date.now());
    const timePart = encode(t, 10);
    crypto.randomFillSync(RAND_BYTES);
    let rand = 0n;
    for (const b of RAND_BYTES) rand = (rand << 8n) | BigInt(b);
    rand &= (1n << 80n) - 1n;
    const randPart = encode(rand, 16);
    return `req_${timePart}${randPart}`;
}

module.exports = { newRequestId };
