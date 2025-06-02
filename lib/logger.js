const fs = require('fs');
const LOG_FILE = './gateway.log';

function log(msg) {
    const out = `[${new Date().toISOString()}] ${msg}`;
    console.log(out);
    fs.appendFileSync(LOG_FILE, out + '\n');
}

module.exports = { log };
