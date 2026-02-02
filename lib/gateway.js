// gateway.js
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const config = require('./config').loadConfig();
const { checkApiKey } = require('./keys');
const rateLimit = require('express-rate-limit');
const logger = require('./logger');
const { startTunnel, getTunnelStatus } = require('./ngrok');

// In-memory domain map, editable via shell
const inMemoryDomains = {
    // Example: 'api.localhost': { target: 'http://localhost:3001' }
    // '*': { target: 'http://localhost:3000' }
};

let server = null;

// Storage for proxy middleware instances (needed for WebSocket upgrade handling)
const proxyMiddlewares = {};
const domainProxyCache = new Map();

// Extract API key from WebSocket upgrade request
function extractApiKey(req) {
    const headerKey = req.headers['x-api-key'];
    if (headerKey) return headerKey;

    const url = new URL(req.url, `http://${req.headers.host}`);
    return url.searchParams.get('key');
}

function getStatus() {
    const tunnelStatus = getTunnelStatus();
    const wsRouteCount = Object.values(config.routes || {}).filter(r => r.ws === true).length;
    const wsDomainCount = Object.values(inMemoryDomains).filter(d => d.ws === true).length;
    return {
        port: config.port,
        domainCount: Object.keys(inMemoryDomains).length,
        routeCount: Object.keys(config.routes || {}).length,
        wsRouteCount,
        wsDomainCount,
        uptime: process.uptime().toFixed(0) + 's',
        tunnel: tunnelStatus ? {
            active: true,
            url: tunnelStatus.url,
            uptime: tunnelStatus.uptime
        } : {
            active: false
        }
    };
}

function getLogs(n = 10) {
    return logger.tail(n); // Assuming your logger supports a 'tail' function
}

function reloadConfig() {
    // Re-require config to reload it
    delete require.cache[require.resolve('./config')];
    const newConfig = require('./config').loadConfig();
    Object.assign(config, newConfig);
}

function startGateway() {
    const app = express();

    // CORS middleware for preflight requests
    app.use((req, res, next) => {
        if (req.method === 'OPTIONS') {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
            return res.sendStatus(200);
        }
        next();
    });

    // Rate limiting for domain-based routes
    const domainRateLimit = rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 5, // Default rate limit for testing
        keyGenerator: (req) => {
            const key = req.get('x-api-key') || req.query.key;
            return key || req.ip;
        },
        message: { error: 'Rate limit exceeded' }
    });

    // --- Domain-based routing (runs first!) ---
    app.use((req, res, next) => {
        const host = req.headers.host;
        const domainCfg = inMemoryDomains[host] || inMemoryDomains['*'];
        if (domainCfg && domainCfg.target) {
            // Check API key for domain routes (assuming they require keys by default)
            const key = req.get('x-api-key') || req.query.key;
            if (!checkApiKey(key)) {
                return res.status(401).json({ error: 'Invalid or missing API key.' });
            }

            // Apply rate limiting
            return domainRateLimit(req, res, (err) => {
                if (err) return next(err);
                
                logger.log(`[Proxy:Domain] ${host} -> ${domainCfg.target} (${req.method} ${req.url})`);
                return createProxyMiddleware({
                    target: domainCfg.target,
                    changeOrigin: true,
                    onProxyReq: (proxyReq, req, res) => {
                        // Add custom headers, etc if needed (expandable)
                    }
                })(req, res, next);
            });
        }
        next();
    });

    // --- API key middleware for path routes ---
    app.use((req, res, next) => {
        const routeCfg = config.routes[Object.keys(config.routes).find(r => req.path.startsWith(r))];
        if (routeCfg && routeCfg.api_key_required) {
            const key = req.get('x-api-key') || req.query.key;
            if (!checkApiKey(key)) {
                return res.status(401).json({ error: 'Invalid or missing API key.' });
            }
        }
        next();
    });

    // --- Path-based route proxies (with WebSocket support) ---
    for (const [path, routeCfg] of Object.entries(config.routes)) {
        // Rate limiting
        if (routeCfg.rate_limit) {
            app.use(path, rateLimit({
                windowMs: 60 * 1000,
                max: routeCfg.rate_limit,
                keyGenerator: req => req.get('x-api-key') || req.ip
            }));
        }
        // Create proxy with WebSocket support if enabled
        const proxy = createProxyMiddleware({
            target: routeCfg.target,
            changeOrigin: true,
            pathRewrite: (p) => p.replace(path, ''),
            ws: routeCfg.ws === true,
            onProxyReq: (proxyReq, req, res) => {
                logger.log(`[Proxy:Route] ${req.method} ${req.originalUrl} -> ${routeCfg.target}`);

                // Custom headers
                if (routeCfg.headers && typeof routeCfg.headers === 'object') {
                    for (const [header, value] of Object.entries(routeCfg.headers)) {
                        proxyReq.setHeader(header, value);
                    }
                }

                // CORS
                if (routeCfg.cors) {
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
                    res.setHeader('Access-Control-Allow-Headers', '*');
                }
            }
        });

        // Store reference for WebSocket upgrade handling
        if (routeCfg.ws === true) {
            proxyMiddlewares[path] = { proxy, config: routeCfg };
        }

        app.use(path, proxy);
    }

    // Logging middleware
    app.use((req, res, next) => {
        logger.log(`${req.method} ${req.url}`);
        next();
    });

    // Start server
    server = app.listen(config.port, async () => {
        logger.log(`Liten Gateway running on port ${config.port}`);

        // Auto-start ngrok tunnel if configured
        if (config.ngrok && config.ngrok.auto_start) {
            try {
                const ngrokOptions = {};
                if (config.ngrok.authtoken) ngrokOptions.authtoken = config.ngrok.authtoken;
                if (config.ngrok.domain) ngrokOptions.domain = config.ngrok.domain;
                if (config.ngrok.subdomain) ngrokOptions.subdomain = config.ngrok.subdomain;
                if (config.ngrok.region) ngrokOptions.region = config.ngrok.region;

                const tunnelInfo = await startTunnel(config.port, ngrokOptions);
                logger.log(`[ngrok] Auto-started tunnel: ${tunnelInfo.url} -> localhost:${config.port}`);
            } catch (error) {
                logger.log(`[ngrok] Failed to auto-start tunnel: ${error.message}`);
            }
        }
    });

    // --- WebSocket upgrade handling ---
    server.on('upgrade', (req, socket, head) => {
        const url = req.url;
        const host = req.headers.host;

        // Find matching path-based route
        let matchedProxy = null;
        let matchedConfig = null;

        for (const [path, { proxy, config: cfg }] of Object.entries(proxyMiddlewares)) {
            if (url.startsWith(path)) {
                matchedProxy = proxy;
                matchedConfig = cfg;
                break;
            }
        }

        // Check domain-based routes
        if (!matchedProxy) {
            const domainCfg = inMemoryDomains[host] || inMemoryDomains['*'];
            if (domainCfg && domainCfg.ws === true) {
                if (!domainProxyCache.has(host)) {
                    domainProxyCache.set(host, createProxyMiddleware({
                        target: domainCfg.target,
                        changeOrigin: true,
                        ws: true
                    }));
                }
                matchedProxy = domainProxyCache.get(host);
                matchedConfig = domainCfg;
            }
        }

        // No matching WebSocket route
        if (!matchedProxy) {
            logger.log(`[WS:404] No WebSocket route for ${url}`);
            socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
            socket.destroy();
            return;
        }

        // Authenticate
        if (matchedConfig.api_key_required !== false) {
            const key = extractApiKey(req);
            if (!checkApiKey(key)) {
                logger.log(`[WS:401] Invalid API key for ${url}`);
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }
        }

        logger.log(`[WS:Upgrade] ${url} -> ${matchedConfig.target}`);
        matchedProxy.upgrade(req, socket, head);
    });

    // --- Return management functions for shell ---
    return {
        addDomain: (host, target, options = {}) => {
            inMemoryDomains[host] = {
                target,
                ws: options.ws === true,
                api_key_required: options.api_key_required !== false
            };
        },
        removeDomain: (host) => {
            delete inMemoryDomains[host];
            domainProxyCache.delete(host);
        },
        listDomains: () => Object.entries(inMemoryDomains),
        showDomain: (host) => inMemoryDomains[host],
        server: server,
        close: () => {
            if (server) {
                server.close();
                server = null;
            }
            domainProxyCache.clear();
        }
    };
}

function stopGateway() {
    if (server) {
        server.close();
        server = null;
    }
}

module.exports = { startGateway, stopGateway, getLogs, getStatus, reloadConfig };
