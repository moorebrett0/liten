const fs = require('fs');
const yaml = require('js-yaml');

const VALID_LOG_FORMATS = new Set(['text', 'jsonl']);

function normalize(cfg) {
    if (cfg.log_format === undefined || cfg.log_format === null) {
        cfg.log_format = 'text';
    } else if (!VALID_LOG_FORMATS.has(cfg.log_format)) {
        throw new Error(`invalid log_format: ${cfg.log_format}. Expected 'text' or 'jsonl'.`);
    }
    return cfg;
}

function loadConfig() {
    let cfg;
    if (fs.existsSync('./config.yaml')) {
        cfg = yaml.load(fs.readFileSync('./config.yaml', 'utf8'));
    } else if (fs.existsSync('./config.json')) {
        cfg = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
    } else {
        throw new Error('No config file found!');
    }
    return normalize(cfg || {});
}

module.exports = { loadConfig };
