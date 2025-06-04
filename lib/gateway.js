// gateway.js
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const config = require('./config').loadConfig();
const { checkApiKey } = require('./keys');
const rateLimit = require('express-rate-limit');
const logger = require('./logger');

// In-memory domain map, editable via shell
const inMemoryDomains = {
    // Example: 'api.localhost': { target: 'http://localhost:3001' }
    // '*': { target: 'http://localhost:3000' }
};

function startGateway() {
    const app = express();

    // --- Domain-based routing (runs first!) ---
    app.use((req, res, next) => {
        const host = req.headers.host;
        const domainCfg = inMemoryDomains[host] || inMemoryDomains['*'];
        if (domainCfg && domainCfg.target) {
            logger.log(`[Proxy:Domain] ${host} -> ${domainCfg.target} (${req.method} ${req.url})`);
            return createProxyMiddleware({
                target: domainCfg.target,
                changeOrigin: true,
                onProxyReq: (proxyReq, req, res) => {
                    // Add custom headers, etc if needed (expandable)
                }
            })(req, res, next);
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

    // --- Path-based route proxies (as before) ---
    for (const [path, routeCfg] of Object.entries(config.routes)) {
        // Rate limiting
        if (routeCfg.rate_limit) {
            app.use(path, rateLimit({
                windowMs: 60 * 1000,
                max: routeCfg.rate_limit,
                keyGenerator: req => req.get('x-api-key') || req.ip
            }));
        }
        // Proxy
        app.use(path, createProxyMiddleware({
            target: routeCfg.target,
            changeOrigin: true,
            pathRewrite: (p) => p.replace(path, ''),
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
        }));
    }

    // Logging middleware
    app.use((req, res, next) => {
        logger.log(`${req.method} ${req.url}`);
        next();
    });

    // Start server
    app.listen(config.port, () => {
        logger.log(`Liten Gateway running on port ${config.port}`);
    });

    // --- Return management functions for shell ---
    return {
        addDomain: (host, target) => { inMemoryDomains[host] = { target }; },
        removeDomain: (host) => { delete inMemoryDomains[host]; },
        listDomains: () => Object.entries(inMemoryDomains),
        showDomain: (host) => inMemoryDomains[host]
    };
}

module.exports = { startGateway };
