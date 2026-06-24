const fs = require('fs');
const path = require('path');

const KEY_FILE = path.resolve('./keys.json');

let cache = null;
let watcher = null;

function readFromDisk() {
    if (!fs.existsSync(KEY_FILE)) return [];
    try {
        const parsed = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function ensureWatcher() {
    if (watcher || !fs.existsSync(KEY_FILE)) return;
    try {
        watcher = fs.watch(KEY_FILE, { persistent: false }, () => {
            cache = null;
        });
    } catch {
        // fs.watch unsupported on some platforms; cache will simply persist until process restart
    }
}

function getKeys() {
    if (cache === null) {
        cache = readFromDisk();
        ensureWatcher();
    }
    return cache;
}

function saveKeys(keys) {
    fs.writeFileSync(KEY_FILE, JSON.stringify(keys, null, 2));
    cache = keys.slice();
    ensureWatcher();
}

function checkApiKey(key) {
    if (!key) return false;
    return getKeys().includes(key);
}

function addKey(key) {
    const keys = getKeys().slice();
    if (!keys.includes(key)) {
        keys.push(key);
        saveKeys(keys);
        console.log(`Added key: ${key}`);
    } else {
        console.log('Key already exists.');
    }
}

function removeKey(key) {
    const keys = getKeys().filter(k => k !== key);
    saveKeys(keys);
    console.log(`Removed key: ${key}`);
}

function listKeys() {
    return getKeys();
}

module.exports = { checkApiKey, addKey, removeKey, listKeys };
