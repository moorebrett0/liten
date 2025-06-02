const fs = require('fs');
const yaml = require('js-yaml');

function loadConfig() {
    if (fs.existsSync('./config.yaml')) {
        return yaml.load(fs.readFileSync('./config.yaml', 'utf8'));
    } else if (fs.existsSync('./config.json')) {
        return JSON.parse(fs.readFileSync('./config.json', 'utf8'));
    } else {
        throw new Error('No config file found!');
    }
}
module.exports = { loadConfig };
