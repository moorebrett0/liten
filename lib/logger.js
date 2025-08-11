// logger.js
const fs = require('fs');
const LOG_FILE = './gateway.log';

function log(msg) {
    const out = `[${new Date().toISOString()}] ${msg}`;
    console.log(out);
    fs.appendFileSync(LOG_FILE, out + '\n');
}

function tail(n = 10) {
    if (!fs.existsSync(LOG_FILE)) return [];
    const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n');
    return lines.slice(-n);
}

module.exports = { log, tail };
