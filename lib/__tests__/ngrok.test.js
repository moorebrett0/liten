// ngrok.test.js - Tests for ngrok integration
const { 
    startTunnel, 
    stopTunnel, 
    getTunnelStatus, 
    isTunnelActive, 
    getTunnelUrl,
    resetState
} = require('../ngrok');

// Mock the ngrok module
jest.mock('@ngrok/ngrok', () => ({
    forward: jest.fn(),
    authtoken: jest.fn()
}));

const ngrok = require('@ngrok/ngrok');

describe('ngrok Integration', () => {
    let mockListener;
    
    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        
        // Create mock listener
        mockListener = {
            url: jest.fn().mockReturnValue('https://abc123.ngrok.app'),
            close: jest.fn().mockResolvedValue(undefined)
        };
        
        ngrok.forward.mockResolvedValue(mockListener);
        ngrok.authtoken.mockResolvedValue(undefined);
    });

    afterEach(async () => {
        // Reset the module state between tests
        resetState();
    });

    describe('startTunnel', () => {
        test('should start a tunnel successfully', async () => {
            const port = 8080;
            const result = await startTunnel(port);

            expect(ngrok.forward).toHaveBeenCalledWith({ addr: port });
            expect(mockListener.url).toHaveBeenCalled();
            expect(result).toEqual({
                url: 'https://abc123.ngrok.app',
                port: port,
                startTime: expect.any(Date),
                options: {}
            });
        });

        test('should start tunnel with custom options', async () => {
            const port = 3000;
            const options = {
                authtoken: 'test-token',
                domain: 'custom.ngrok.app',
                region: 'eu'
            };

            const result = await startTunnel(port, options);

            expect(ngrok.authtoken).toHaveBeenCalledWith('test-token');
            expect(ngrok.forward).toHaveBeenCalledWith({
                addr: port,
                authtoken: 'test-token',
                domain: 'custom.ngrok.app',
                region: 'eu'
            });
            expect(result.options).toEqual(options);
        });

        test('should throw error if tunnel already running', async () => {
            await startTunnel(8080);
            
            await expect(startTunnel(8080)).rejects.toThrow(
                'Tunnel is already running. Stop the current tunnel first.'
            );
        });

        test('should handle ngrok errors', async () => {
            ngrok.forward.mockRejectedValue(new Error('ngrok failed'));

            await expect(startTunnel(8080)).rejects.toThrow('ngrok failed');
        });
    });

    describe('stopTunnel', () => {
        test('should stop an active tunnel', async () => {
            await startTunnel(8080);
            
            const result = await stopTunnel();

            expect(mockListener.close).toHaveBeenCalled();
            expect(result).toBe(true);
            expect(isTunnelActive()).toBe(false);
        });

        test('should return false if no tunnel is running', async () => {
            const result = await stopTunnel();
            expect(result).toBe(false);
        });

        test('should handle close errors', async () => {
            // Set up the error before starting the tunnel
            const errorListener = {
                url: jest.fn().mockReturnValue('https://abc123.ngrok.app'),
                close: jest.fn().mockRejectedValue(new Error('Close failed'))
            };
            ngrok.forward.mockResolvedValueOnce(errorListener);
            
            await startTunnel(8080);

            await expect(stopTunnel()).rejects.toThrow('Close failed');
        });
    });

    describe('getTunnelStatus', () => {
        test('should return null when no tunnel is active', () => {
            const status = getTunnelStatus();
            expect(status).toBeNull();
        });

        test('should return tunnel status when active', async () => {
            const startTime = new Date();
            await startTunnel(8080, { domain: 'test.ngrok.app' });
            
            // Wait a moment to get non-zero uptime
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const status = getTunnelStatus();
            
            expect(status).toEqual({
                url: 'https://abc123.ngrok.app',
                port: 8080,
                uptime: expect.stringMatching(/^\d+s$/),
                uptimeSeconds: expect.any(Number),
                startTime: expect.any(Date),
                options: { domain: 'test.ngrok.app' }
            });
            
            expect(status.startTime).toBeInstanceOf(Date);
            expect(status.startTime.getTime()).toBeGreaterThanOrEqual(startTime.getTime());
        });
    });

    describe('isTunnelActive', () => {
        test('should return false when no tunnel is running', () => {
            expect(isTunnelActive()).toBe(false);
        });

        test('should return true when tunnel is running', async () => {
            await startTunnel(8080);
            expect(isTunnelActive()).toBe(true);
        });

        test('should return false after tunnel is stopped', async () => {
            await startTunnel(8080);
            await stopTunnel();
            expect(isTunnelActive()).toBe(false);
        });
    });

    describe('getTunnelUrl', () => {
        test('should return null when no tunnel is active', () => {
            expect(getTunnelUrl()).toBeNull();
        });

        test('should return tunnel URL when active', async () => {
            await startTunnel(8080);
            expect(getTunnelUrl()).toBe('https://abc123.ngrok.app');
        });
    });
});
