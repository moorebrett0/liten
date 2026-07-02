// logger.js
const fs = require('fs');
const path = require('path');

const LOG_FILE = './gateway.log';
const JSONL_FILE = path.join(path.dirname(LOG_FILE), path.basename(LOG_FILE, path.extname(LOG_FILE)) + '.jsonl');

const SENSITIVE_QUERY_KEYS = ['api_key', 'apikey', 'token', 'access_token', 'secret'];

let jsonlStream = null;

function getJsonlStream() {
    if (jsonlStream) return jsonlStream;
    jsonlStream = fs.createWriteStream(JSONL_FILE, { flags: 'a' });
    jsonlStream.on('error', (err) => {
        process.stderr.write(`[liten logger] jsonl write error: ${err.message}\n`);
    });
    return jsonlStream;
}

function closeJsonlStream() {
    if (jsonlStream) {
        try { jsonlStream.end(); } catch { /* noop */ }
        jsonlStream = null;
    }
}

function log(msg) {
    const out = `[${new Date().toISOString()}] ${msg}`;
    console.log(out);
    fs.appendFileSync(LOG_FILE, out + '\n');
}

function logfmt(fields) {
    return Object.entries(fields)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => {
            const s = String(v);
            if (/[\s="]/.test(s)) return `${k}="${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
            return `${k}=${s}`;
        })
        .join(' ');
}

function event(fields) {
    log(logfmt(fields));
}

function logRecord(record) {
    try {
        getJsonlStream().write(JSON.stringify(record) + '\n');
    } catch (err) {
        process.stderr.write(`[liten logger] jsonl serialize error: ${err.message}\n`);
    }
}

function redactPath(rawPath) {
    if (!rawPath) return rawPath;
    const qIdx = rawPath.indexOf('?');
    if (qIdx === -1) return rawPath;
    const base = rawPath.slice(0, qIdx);
    const query = rawPath.slice(qIdx + 1);
    const redacted = query.split('&').map(pair => {
        const eq = pair.indexOf('=');
        if (eq === -1) return pair;
        const key = pair.slice(0, eq);
        if (SENSITIVE_QUERY_KEYS.includes(key.toLowerCase())) {
            return `${key}=REDACTED`;
        }
        return pair;
    }).join('&');
    return `${base}?${redacted}`;
}

function tail(n = 10) {
    if (!fs.existsSync(LOG_FILE)) return [];
    const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n');
    return lines.slice(-n);
}

module.exports = {
    log,
    event,
    logfmt,
    logRecord,
    redactPath,
    tail,
    closeJsonlStream,
    SENSITIVE_QUERY_KEYS,
    JSONL_FILE,
    LOG_FILE
};
