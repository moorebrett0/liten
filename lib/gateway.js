// gateway.js
const express = require('express');
const crypto = require('crypto');
const { createProxyMiddleware } = require('http-proxy-middleware');
const config = require('./config').loadConfig();
const { checkApiKey } = require('./keys');
const rateLimit = require('express-rate-limit');
const logger = require('./logger');
const { startTunnel, getTunnelStatus } = require('./ngrok');
const { newRequestId } = require('./id');

function hashKey(key) {
    if (!key) return null;
    return 'sha256:' + crypto.createHash('sha256').update(String(key)).digest('hex');
}

// Frozen UA bucketing — must match the vendored classifier on the liten-brain side.
function bucketUA(ua) {
    if (!ua) return 'other';
    ua = ua.toLowerCase();
    if (ua.includes('curl'))            return 'curl';
    if (ua.includes('python-requests')) return 'python-requests';
    if (ua.includes('node-fetch') || ua.includes('axios') || ua.includes('undici')) return 'node';
    if (ua.includes('chrome') && !ua.includes('edg')) return 'chrome';
    if (ua.includes('firefox'))         return 'firefox';
    if (ua.includes('safari') && !ua.includes('chrome')) return 'safari';
    return 'other';
}

function ipBucket(ip) {
    if (!ip) return null;
    const v = ip.replace(/^::ffff:/, '');
    if (v.includes(':')) {
        const groups = v.split(':').filter(Boolean).slice(0, 3);
        while (groups.length < 3) groups.push('0');
        return groups.join(':') + '::/48';
    }
    const parts = v.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    return v;
}

function parseIntOrUndef(v) {
    if (v === undefined || v === null) return undefined;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
}

// Rolling p95 latency per route_key, 300s sliding window.
const P95_WINDOW_MS = 300_000;
const P95_MIN_SAMPLES = 20;
const p95Buckets = new Map();

function p95Observe(routeKey, latencyMs) {
    const now = Date.now();
    let list = p95Buckets.get(routeKey);
    if (!list) { list = []; p95Buckets.set(routeKey, list); }
    list.push([now, latencyMs]);
    const cutoff = now - P95_WINDOW_MS;
    while (list.length && list[0][0] < cutoff) list.shift();
}

function p95IsSlow(routeKey, latencyMs) {
    const list = p95Buckets.get(routeKey);
    if (!list || list.length < P95_MIN_SAMPLES) return false;
    const now = Date.now();
    const cutoff = now - P95_WINDOW_MS;
    while (list.length && list[0][0] < cutoff) list.shift();
    if (list.length < P95_MIN_SAMPLES) return false;
    const sorted = list.map(x => x[1]).slice().sort((a, b) => a - b);
    const idx = Math.floor(0.95 * (sorted.length - 1));
    return latencyMs > sorted[idx];
}

function deriveOutcome(status, latencyMs, routeKey) {
    if (status === 429) return 'throttled';
    if (status >= 500 || status === 499) return 'error';
    if (status >= 200 && status < 300 && p95IsSlow(routeKey, latencyMs)) return 'slow';
    return 'ok';
}

// In-memory domain map, editable via shell
const inMemoryDomains = {
    // Example: 'api.localhost': { target: 'http://localhost:3001' }
    // '*': { target: 'http://localhost:3000' }
};

let server = null;

// Storage for proxy middleware instances (needed for WebSocket upgrade handling)
const proxyMiddlewares = {};
const domainProxyCache = new Map();
const domainRateLimiters = new Map();

const DEFAULT_DOMAIN_RATE_LIMIT = 60;

function buildRateLimiter(max) {
    return rateLimit({
        windowMs: 60 * 1000,
        max,
        keyGenerator: (req) => {
            const key = req.get('x-api-key') || req.query.key;
            return key || req.ip;
        },
        message: { error: 'Rate limit exceeded' }
    });
}

function matchRouteKey(routes, reqPath) {
    return Object.keys(routes).find(r => reqPath === r || reqPath.startsWith(r + '/'));
}

function resolveRoute(req) {
    const host = req.headers.host;
    const exact = inMemoryDomains[host];
    const wildcard = inMemoryDomains['*'];
    const domainCfg = exact || wildcard;
    if (domainCfg && domainCfg.target) {
        return {
            route_key: exact ? host : '*',
            matched_by: 'domain',
            target: domainCfg.target,
            cfg: domainCfg,
            cacheKey: host
        };
    }
    if (config.routes) {
        const matchKey = matchRouteKey(config.routes, req.path);
        if (matchKey) {
            const routeCfg = config.routes[matchKey];
            return {
                route_key: matchKey,
                matched_by: 'path',
                target: routeCfg.target,
                cfg: routeCfg
            };
        }
    }
    return null;
}

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
    return logger.tail(n);
}

function reloadConfig() {
    delete require.cache[require.resolve('./config')];
    const newConfig = require('./config').loadConfig();
    Object.assign(config, newConfig);
}

function startGateway() {
    const app = express();

    // --- Request tracing: id, timing, byte counters, dual-sink completion log ---
    app.use((req, res, next) => {
        req.litenId = newRequestId();
        req.litenStart = Date.now();
        req.litenCtx = { route_key: null, matched_by: null, target: null, api_key_hash: null };
        res.setHeader('X-Request-Id', req.litenId);

        let resBytes = 0;
        const origWrite = res.write.bind(res);
        const origEnd = res.end.bind(res);
        res.write = (chunk, ...rest) => {
            if (chunk) resBytes += Buffer.byteLength(chunk);
            return origWrite(chunk, ...rest);
        };
        res.end = (chunk, ...rest) => {
            if (chunk && typeof chunk !== 'function') resBytes += Buffer.byteLength(chunk);
            return origEnd(chunk, ...rest);
        };

        let logged = false;
        const finalize = (statusOverride) => {
            if (logged) return;
            logged = true;
            const latency_ms = Date.now() - req.litenStart;
            const status = statusOverride ?? res.statusCode;
            const rawPath = req.originalUrl || req.url;
            const ua = req.headers['user-agent'];
            const key = req.get('x-api-key') || (req.query && req.query.key);
            const hashCandidate = req.litenCtx.api_key_hash ?? (key ? hashKey(key) : null);
            const req_bytes = parseIntOrUndef(req.headers['content-length']) ?? 0;
            const measured_res_bytes = resBytes || parseIntOrUndef(res.getHeader('content-length')) || 0;

            // Text log (logfmt completion line — always written)
            logger.event({
                id: req.litenId,
                method: req.method,
                url: rawPath,
                host: req.headers.host,
                status,
                latency_ms,
                req_bytes,
                res_bytes: measured_res_bytes || undefined,
                ua_family: bucketUA(ua),
                api_key_hash: hashCandidate,
                client_ip_bucket: ipBucket(req.ip),
                matched_by: req.litenCtx.matched_by,
                target: req.litenCtx.target
            });

            // JSONL sink (opt-in, skips 404s)
            if (config.log_format === 'jsonl' && req.litenCtx.route_key) {
                const ts = new Date();
                const record = {
                    ts: ts.toISOString(),
                    id: req.litenId,
                    method: req.method,
                    path: logger.redactPath(rawPath),
                    host: req.headers.host || null,
                    route_key: req.litenCtx.route_key,
                    matched_by: req.litenCtx.matched_by,
                    target: req.litenCtx.target,
                    api_key_hash: hashCandidate,
                    status,
                    latency_ms,
                    req_bytes,
                    res_bytes: measured_res_bytes,
                    ua_family: bucketUA(ua),
                    client_ip_bucket: ipBucket(req.ip),
                    hour_of_day: ts.getUTCHours(),
                    day_of_week: (ts.getUTCDay() + 6) % 7,
                    outcome: deriveOutcome(status, latency_ms, req.litenCtx.route_key)
                };
                logger.logRecord(record);
                // Observe after emit so the "am I slow" check uses the prior window.
                p95Observe(req.litenCtx.route_key, latency_ms);
            }
        };
        res.on('finish', () => finalize());
        res.on('close', () => finalize(res.writableFinished ? undefined : 499));
        next();
    });

    // --- Route resolution (populates req.litenCtx before CORS/auth/proxy) ---
    app.use((req, res, next) => {
        const resolved = resolveRoute(req);
        if (resolved) {
            req.litenResolved = resolved;
            req.litenCtx.route_key = resolved.route_key;
            req.litenCtx.matched_by = resolved.matched_by;
            req.litenCtx.target = resolved.target;
        }
        next();
    });

    // --- CORS preflight (204 so it emits a training-signal record) ---
    app.use((req, res, next) => {
        if (req.method === 'OPTIONS') {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
            return res.sendStatus(204);
        }
        next();
    });

    // --- Domain-based handling ---
    app.use((req, res, next) => {
        if (!req.litenResolved || req.litenResolved.matched_by !== 'domain') return next();
        const { cfg: domainCfg, cacheKey } = req.litenResolved;

        if (domainCfg.api_key_required !== false) {
            const key = req.get('x-api-key') || req.query.key;
            req.litenCtx.api_key_hash = key ? hashKey(key) : null;
            if (!checkApiKey(key)) {
                return res.status(401).json({ error: 'Invalid or missing API key.' });
            }
        }

        const limiter = domainRateLimiters.get(cacheKey) || domainRateLimiters.get('*');
        const runProxy = (err) => {
            if (err) return next(err);
            if (!domainProxyCache.has(cacheKey)) {
                domainProxyCache.set(cacheKey, createProxyMiddleware({
                    target: domainCfg.target,
                    changeOrigin: true
                }));
            }
            return domainProxyCache.get(cacheKey)(req, res, next);
        };
        return limiter ? limiter(req, res, runProxy) : runProxy();
    });

    // --- Path-route auth (populates api_key_hash even on success) ---
    app.use((req, res, next) => {
        if (!req.litenResolved || req.litenResolved.matched_by !== 'path') return next();
        const routeCfg = req.litenResolved.cfg;
        if (routeCfg.api_key_required) {
            const key = req.get('x-api-key') || req.query.key;
            req.litenCtx.api_key_hash = key ? hashKey(key) : null;
            if (!checkApiKey(key)) {
                return res.status(401).json({ error: 'Invalid or missing API key.' });
            }
        }
        next();
    });

    // --- Path-based route proxies (with WebSocket support) ---
    for (const [routePath, routeCfg] of Object.entries(config.routes || {})) {
        if (routeCfg.rate_limit) {
            app.use(routePath, buildRateLimiter(routeCfg.rate_limit));
        }
        const proxy = createProxyMiddleware({
            target: routeCfg.target,
            changeOrigin: true,
            pathRewrite: (p) => p.replace(routePath, ''),
            ws: routeCfg.ws === true,
            onProxyReq: (proxyReq, req, res) => {
                if (routeCfg.headers && typeof routeCfg.headers === 'object') {
                    for (const [header, value] of Object.entries(routeCfg.headers)) {
                        proxyReq.setHeader(header, value);
                    }
                }
                if (routeCfg.cors) {
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
                    res.setHeader('Access-Control-Allow-Headers', '*');
                }
            }
        });

        if (routeCfg.ws === true) {
            proxyMiddlewares[routePath] = { proxy, config: routeCfg };
        }

        app.use(routePath, proxy);
    }

    server = app.listen(config.port, async () => {
        logger.log(`Liten Gateway running on port ${config.port}`);

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

    // --- WebSocket upgrade handling (no JSONL records for WS in v1) ---
    server.on('upgrade', (req, socket, head) => {
        const url = req.url;
        const host = req.headers.host;
        const reqPath = new URL(url, `http://${host || 'localhost'}`).pathname;

        let matchedProxy = null;
        let matchedConfig = null;

        for (const [path, { proxy, config: cfg }] of Object.entries(proxyMiddlewares)) {
            if (reqPath === path || reqPath.startsWith(path + '/')) {
                matchedProxy = proxy;
                matchedConfig = cfg;
                break;
            }
        }

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

        if (!matchedProxy) {
            logger.log(`[WS:404] No WebSocket route for ${url}`);
            socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
            socket.destroy();
            return;
        }

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

    return {
        addDomain: (host, target, options = {}) => {
            const rateLimit = options.rate_limit ?? DEFAULT_DOMAIN_RATE_LIMIT;
            inMemoryDomains[host] = {
                target,
                ws: options.ws === true,
                api_key_required: options.api_key_required !== false,
                rate_limit: rateLimit
            };
            domainProxyCache.delete(host);
            if (rateLimit) {
                domainRateLimiters.set(host, buildRateLimiter(rateLimit));
            } else {
                domainRateLimiters.delete(host);
            }
        },
        removeDomain: (host) => {
            delete inMemoryDomains[host];
            domainProxyCache.delete(host);
            domainRateLimiters.delete(host);
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
            domainRateLimiters.clear();
        }
    };
}

function stopGateway() {
    if (server) {
        server.close();
        server = null;
    }
}

module.exports = {
    startGateway,
    stopGateway,
    getLogs,
    getStatus,
    reloadConfig,
    // Exports for tests
    _internals: { bucketUA, hashKey, ipBucket, deriveOutcome, p95Observe, resetP95: () => p95Buckets.clear() }
};
