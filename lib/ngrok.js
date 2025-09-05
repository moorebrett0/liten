// ngrok.js - ngrok tunnel management for Liten Gateway
const ngrok = require('@ngrok/ngrok');
const logger = require('./logger');

let currentTunnel = null;
let ngrokListener = null;

/**
 * Start an ngrok tunnel for the current gateway
 * @param {number} port - The local port to tunnel
 * @param {Object} options - Tunnel options
 * @param {string} options.authtoken - ngrok authtoken (optional)
 * @param {string} options.domain - Custom domain (optional)
 * @param {string} options.subdomain - Subdomain (optional)
 * @param {string} options.region - Region (us, eu, ap, au, sa, jp, in)
 * @returns {Promise<Object>} Tunnel information
 */
async function startTunnel(port, options = {}) {
    try {
        if (currentTunnel) {
            throw new Error('Tunnel is already running. Stop the current tunnel first.');
        }

        // Build tunnel options
        const tunnelOptions = {
            addr: port,
            ...options
        };

        // Set authtoken if provided (from options, environment, or default)
        const authtoken = options.authtoken || process.env.NGROK_AUTHTOKEN;
        if (authtoken) {
            await ngrok.authtoken(authtoken);
        }

        logger.log(`[ngrok] Starting tunnel on port ${port}...`);
        
        // Start the tunnel
        ngrokListener = await ngrok.forward(tunnelOptions);
        
        // Get tunnel info
        const url = ngrokListener.url();
        
        currentTunnel = {
            url: url,
            port: port,
            startTime: new Date(),
            options: options
        };

        logger.log(`[ngrok] Tunnel started: ${url} -> localhost:${port}`);
        
        return currentTunnel;
    } catch (error) {
        logger.log(`[ngrok] Error starting tunnel: ${error.message}`);
        throw error;
    }
}

/**
 * Stop the current ngrok tunnel
 * @returns {Promise<boolean>} Success status
 */
async function stopTunnel() {
    try {
        if (!currentTunnel || !ngrokListener) {
            return false;
        }

        logger.log(`[ngrok] Stopping tunnel: ${currentTunnel.url}`);
        
        await ngrokListener.close();
        
        const stoppedTunnel = currentTunnel;
        currentTunnel = null;
        ngrokListener = null;
        
        logger.log(`[ngrok] Tunnel stopped: ${stoppedTunnel.url}`);
        
        return true;
    } catch (error) {
        logger.log(`[ngrok] Error stopping tunnel: ${error.message}`);
        throw error;
    }
}

/**
 * Get current tunnel status
 * @returns {Object|null} Current tunnel information or null if no tunnel
 */
function getTunnelStatus() {
    if (!currentTunnel) {
        return null;
    }

    const uptime = Math.floor((new Date() - currentTunnel.startTime) / 1000);
    
    return {
        url: currentTunnel.url,
        port: currentTunnel.port,
        uptime: `${uptime}s`,
        uptimeSeconds: uptime,
        startTime: currentTunnel.startTime,
        options: currentTunnel.options
    };
}

/**
 * Check if a tunnel is currently running
 * @returns {boolean} True if tunnel is active
 */
function isTunnelActive() {
    return currentTunnel !== null && ngrokListener !== null;
}

/**
 * Get tunnel URL if active
 * @returns {string|null} Tunnel URL or null if no tunnel
 */
function getTunnelUrl() {
    return currentTunnel ? currentTunnel.url : null;
}

/**
 * Gracefully shutdown ngrok when the process exits
 */
async function gracefulShutdown() {
    if (currentTunnel) {
        try {
            await stopTunnel();
        } catch (error) {
            logger.log(`[ngrok] Error during graceful shutdown: ${error.message}`);
        }
    }
}

/**
 * Reset the module state (for testing)
 */
function resetState() {
    currentTunnel = null;
    ngrokListener = null;
}

// Register cleanup handlers
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('exit', gracefulShutdown);

module.exports = {
    startTunnel,
    stopTunnel,
    getTunnelStatus,
    isTunnelActive,
    getTunnelUrl,
    gracefulShutdown,
    resetState
};
