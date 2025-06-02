const fs = require('fs');

const KEY_FILE = './keys.json';

function getKeys() {
    if (fs.existsSync(KEY_FILE)) {
        return JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
    }
    return [];
}

function saveKeys(keys) {
    fs.writeFileSync(KEY_FILE, JSON.stringify(keys));
}

function checkApiKey(key) {
    const keys = getKeys();
    return keys.includes(key);
}

function addKey(key) {
    const keys = getKeys();
    if (!keys.includes(key)) {
        keys.push(key);
        saveKeys(keys);
        console.log(`Added key: ${key}`);
    } else {
        console.log('Key already exists.');
    }
}

function removeKey(key) {
    let keys = getKeys();
    keys = keys.filter(k => k !== key);
    saveKeys(keys);
    console.log(`Removed key: ${key}`);
}

function listKeys() {
    if (fs.existsSync(KEY_FILE)) {
        return JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
    }
    return [];
}

module.exports = { checkApiKey, addKey, removeKey, listKeys };
