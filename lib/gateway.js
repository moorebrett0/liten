const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const config = require('./config').loadConfig();
const { checkApiKey } = require('./keys');
const rateLimit = require('express-rate-limit');
const logger = require('./logger');

function startGateway() {
    const app = express();

    // API key middleware
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

    // Route proxies
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
                logger.log(`[Proxy] ${req.method} ${req.originalUrl} -> ${routeCfg.target}`);

                // --- ADD CUSTOM HEADERS ---
                if (routeCfg.headers && typeof routeCfg.headers === 'object') {
                    for (const [header, value] of Object.entries(routeCfg.headers)) {
                        proxyReq.setHeader(header, value);
                    }
                }

                // --- ENABLE CORS IF SET ---
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

    app.listen(config.port, () => {
        logger.log(`Liten Gateway running on port ${config.port}`);
    });
}

module.exports = { startGateway };
