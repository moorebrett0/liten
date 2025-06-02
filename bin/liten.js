#!/usr/bin/env node
const { startGateway, getStatus, getLogs, reloadConfig } = require('../lib/gateway');
const { addKey, removeKey, listKeys } = require('../lib/keys');
const program = require('commander');
const readline = require('readline');

// --- 1. Interactive shell ---

function launchShell() {
    startGateway(); // Launch gateway in background

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'Liten > '
    });

    console.log('\nWelcome to Liten Gateway!');
    console.log('Type "help" for a list of commands.\n');
    rl.prompt();

    rl.on('line', (line) => {
        const input = line.trim();
        const [cmd, ...args] = input.split(' ');

        switch (cmd) {
            case 'help':
                console.log(`
Commands:
  status                  Show gateway status
  list-keys               List all API keys
  add-key <key>           Add an API key
  remove-key <key>        Remove an API key
  logs [n]                Show the last n log lines (default 10)
  reload                  Reload config file
  exit / quit             Exit the gateway
        `);
                break;
            case 'status':
                console.log(getStatus());
                break;
            case 'list-keys':
                listKeys().forEach(k => console.log(k));
                break;
            case 'add-key':
                if (!args[0]) return console.log('Usage: add-key <key>');
                addKey(args[0]);
                break;
            case 'remove-key':
                if (!args[0]) return console.log('Usage: remove-key <key>');
                removeKey(args[0]);
                break;
            case 'logs':
                const n = parseInt(args[0]) || 10;
                getLogs(n).forEach(line => console.log(line));
                break;
            case 'reload':
                reloadConfig();
                console.log('Config reloaded.');
                break;
            case 'exit':
            case 'quit':
                console.log('Shutting down Liten Gateway.');
                process.exit(0);
                break;
            case '':
                break; // ignore blank
            default:
                console.log(`Unknown command: ${cmd}. Type "help" for commands.`);
        }
        rl.prompt();
    });


    rl.on('close', () => {
        console.log('\nExiting Liten Gateway.');
        process.exit(0);
    });
}


if (process.argv.length <= 2) {
    launchShell();
} else {
    program.parse(process.argv);
}

