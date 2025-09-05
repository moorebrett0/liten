#!/usr/bin/env node
const { startGateway, getStatus, getLogs, reloadConfig } = require('../lib/gateway');
const { addKey, removeKey, listKeys } = require('../lib/keys');
const { startTunnel, stopTunnel, getTunnelStatus, isTunnelActive } = require('../lib/ngrok');
const readline = require('readline');

// --- 1. Interactive shell ---

function launchShell() {
    const gateway = startGateway();

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'Liten > '
    });

    console.log('\nWelcome to Liten Gateway!');
    console.log('Type "help" for a list of commands.\n');
    rl.prompt();

    rl.on('line', async (line) => {
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
  add-domain <d> <tgt>    Add a domain route (host target)
  remove-domain <d>       Remove a domain route
  list-domains            List all domain routes
  show-domain <d>         Show domain route details
  start-tunnel [opts]     Start ngrok tunnel (opts: --authtoken=<token> --domain=<domain> --region=<region>)
  stop-tunnel             Stop ngrok tunnel
  tunnel-status           Show tunnel status
  logs [n]                Show the last n log lines (default 10)
  reload                  Reload config file
  exit / quit             Exit the gateway
        `);
                break;
            case 'status':
                const status = getStatus();
                console.log(`Gateway Status:
Port: ${status.port}
Domain Count: ${status.domainCount}
Route Count: ${status.routeCount}
Uptime: ${status.uptime}
Tunnel: ${status.tunnel.active ? `🟢 Active (${status.tunnel.url})` : '🔴 Inactive'}`);
                break;
            case 'add-domain':
                if (args.length < 2) return console.log('Usage: add-domain <domain> <target>');
                gateway.addDomain(args[0], args[1]);
                console.log(`Domain "${args[0]}" -> ${args[1]} added.`);
                break;
            case 'remove-domain':
                if (!args[0]) return console.log('Usage: remove-domain <domain>');
                gateway.removeDomain(args[0]);
                console.log(`Domain "${args[0]}" removed.`);
                break;
            case 'list-domains':
                const domains = gateway.listDomains();
                if (!domains.length) return console.log('No domains configured.');
                domains.forEach(([domain, cfg]) => {
                    console.log(`${domain} -> ${cfg.target}`);
                });
                break;
            case 'show-domain':
                if (!args[0]) return console.log('Usage: show-domain <domain>');
                const d = gateway.showDomain(args[0]);
                if (!d) return console.log('Not found.');
                console.log(`${args[0]} -> ${d.target}`);
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
            case 'start-tunnel':
                try {
                    if (isTunnelActive()) {
                        console.log('Tunnel is already running. Use "tunnel-status" to see details or "stop-tunnel" to stop it.');
                        break;
                    }
                    
                    // Parse options from args
                    const options = {};
                    args.forEach(arg => {
                        if (arg.startsWith('--authtoken=')) {
                            options.authtoken = arg.split('=')[1];
                        } else if (arg.startsWith('--domain=')) {
                            options.domain = arg.split('=')[1];
                        } else if (arg.startsWith('--subdomain=')) {
                            options.subdomain = arg.split('=')[1];
                        } else if (arg.startsWith('--region=')) {
                            options.region = arg.split('=')[1];
                        }
                    });
                    
                    const gatewayStatus = getStatus();
                    const tunnelInfo = await startTunnel(gatewayStatus.port, options);
                    console.log(`✅ Tunnel started successfully!`);
                    console.log(`🌐 Public URL: ${tunnelInfo.url}`);
                    console.log(`📍 Local: localhost:${tunnelInfo.port}`);
                } catch (error) {
                    if (error.message.includes('ERR_NGROK_4018') || error.message.includes('authtoken')) {
                        console.log(`❌ ngrok requires authentication to start tunnels.`);
                        console.log(`📝 To fix this:`);
                        console.log(`   1. Sign up: https://dashboard.ngrok.com/signup`);
                        console.log(`   2. Get your authtoken: https://dashboard.ngrok.com/get-started/your-authtoken`);
                        console.log(`   3. Use: start-tunnel --authtoken=your_token`);
                        console.log(`   4. Or add to config.yaml under 'ngrok: authtoken: your_token'`);
                    } else {
                        console.log(`❌ Failed to start tunnel: ${error.message}`);
                    }
                }
                break;
            case 'stop-tunnel':
                try {
                    const stopped = await stopTunnel();
                    if (stopped) {
                        console.log('✅ Tunnel stopped successfully.');
                    } else {
                        console.log('ℹ️  No tunnel was running.');
                    }
                } catch (error) {
                    console.log(`❌ Failed to stop tunnel: ${error.message}`);
                }
                break;
            case 'tunnel-status':
                const tunnelStatus = getTunnelStatus();
                if (tunnelStatus) {
                    console.log(`Tunnel Status:
🌐 URL: ${tunnelStatus.url}
📍 Port: ${tunnelStatus.port}
⏱️  Uptime: ${tunnelStatus.uptime}
🕐 Started: ${tunnelStatus.startTime.toISOString()}`);
                    if (tunnelStatus.options.domain) {
                        console.log(`🏷️  Domain: ${tunnelStatus.options.domain}`);
                    }
                    if (tunnelStatus.options.region) {
                        console.log(`🌍 Region: ${tunnelStatus.options.region}`);
                    }
                } else {
                    console.log('ℹ️  No tunnel is currently running.');
                }
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


// Always launch the interactive shell
launchShell();

