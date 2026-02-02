const WebSocket = require('ws');
const { startGateway, stopGateway } = require('../gateway');
const { addKey, removeKey } = require('../keys');

describe('WebSocket Proxying', () => {
    let gateway;
    let wsServer;
    const WS_SERVER_PORT = 9001;
    const GATEWAY_PORT = 8080;
    const testKey = 'ws-test-key-' + Date.now();

    beforeAll((done) => {
        // Start a simple WebSocket echo server
        wsServer = new WebSocket.Server({ port: WS_SERVER_PORT }, () => {
            done();
        });

        wsServer.on('connection', (ws) => {
            ws.on('message', (message) => {
                ws.send(`echo: ${message}`);
            });
        });
    });

    afterAll((done) => {
        wsServer.close(done);
    });

    beforeEach(() => {
        addKey(testKey);
        stopGateway();
    });

    afterEach(() => {
        removeKey(testKey);
        if (gateway && gateway.close) {
            gateway.close();
        }
        stopGateway();
    });

    describe('Path-based WebSocket routes', () => {
        it('should proxy WebSocket connections with valid API key in query', (done) => {
            gateway = startGateway();

            // Give the server a moment to start
            setTimeout(() => {
                const ws = new WebSocket(
                    `ws://localhost:${GATEWAY_PORT}/ws-echo?key=${testKey}`
                );

                ws.on('open', () => {
                    ws.send('hello');
                });

                ws.on('message', (data) => {
                    expect(data.toString()).toBe('echo: hello');
                    ws.close();
                    done();
                });

                ws.on('error', (err) => {
                    done(err);
                });
            }, 100);
        });

        it('should proxy WebSocket connections with valid API key in header', (done) => {
            gateway = startGateway();

            setTimeout(() => {
                const ws = new WebSocket(
                    `ws://localhost:${GATEWAY_PORT}/ws-echo`,
                    { headers: { 'x-api-key': testKey } }
                );

                ws.on('open', () => {
                    ws.send('test message');
                });

                ws.on('message', (data) => {
                    expect(data.toString()).toBe('echo: test message');
                    ws.close();
                    done();
                });

                ws.on('error', (err) => {
                    done(err);
                });
            }, 100);
        });

        it('should reject WebSocket without valid API key', (done) => {
            gateway = startGateway();

            setTimeout(() => {
                const ws = new WebSocket(
                    `ws://localhost:${GATEWAY_PORT}/ws-echo`
                );

                ws.on('error', () => {
                    // Expected - connection should fail
                    done();
                });

                ws.on('unexpected-response', (req, res) => {
                    expect(res.statusCode).toBe(401);
                    done();
                });

                ws.on('open', () => {
                    done(new Error('Should not have connected without API key'));
                });
            }, 100);
        });

        it('should reject WebSocket with invalid API key', (done) => {
            gateway = startGateway();

            setTimeout(() => {
                const ws = new WebSocket(
                    `ws://localhost:${GATEWAY_PORT}/ws-echo?key=invalid-key`
                );

                ws.on('error', () => {
                    // Expected - connection should fail
                    done();
                });

                ws.on('unexpected-response', (req, res) => {
                    expect(res.statusCode).toBe(401);
                    done();
                });

                ws.on('open', () => {
                    done(new Error('Should not have connected with invalid API key'));
                });
            }, 100);
        });

        it('should return 404 for non-WebSocket routes', (done) => {
            gateway = startGateway();

            setTimeout(() => {
                const ws = new WebSocket(
                    `ws://localhost:${GATEWAY_PORT}/openai?key=${testKey}`
                );

                ws.on('error', () => {
                    // Expected - connection should fail
                    done();
                });

                ws.on('unexpected-response', (req, res) => {
                    expect(res.statusCode).toBe(404);
                    done();
                });

                ws.on('open', () => {
                    done(new Error('Should not have connected to non-WS route'));
                });
            }, 100);
        });
    });

    describe('Domain-based WebSocket routes', () => {
        it('should proxy WebSocket connections for domain with ws enabled', (done) => {
            gateway = startGateway();
            gateway.addDomain('ws.test', `ws://localhost:${WS_SERVER_PORT}`, { ws: true });

            setTimeout(() => {
                const ws = new WebSocket(
                    `ws://localhost:${GATEWAY_PORT}/`,
                    {
                        headers: {
                            'Host': 'ws.test',
                            'x-api-key': testKey
                        }
                    }
                );

                ws.on('open', () => {
                    ws.send('domain test');
                });

                ws.on('message', (data) => {
                    expect(data.toString()).toBe('echo: domain test');
                    ws.close();
                    done();
                });

                ws.on('error', (err) => {
                    done(err);
                });
            }, 100);
        });

        it('should reject WebSocket for domain without ws enabled', (done) => {
            gateway = startGateway();
            gateway.addDomain('http.test', `http://localhost:${WS_SERVER_PORT}`, { ws: false });

            setTimeout(() => {
                const ws = new WebSocket(
                    `ws://localhost:${GATEWAY_PORT}/`,
                    {
                        headers: {
                            'Host': 'http.test',
                            'x-api-key': testKey
                        }
                    }
                );

                ws.on('error', () => {
                    // Expected - connection should fail
                    done();
                });

                ws.on('unexpected-response', (req, res) => {
                    expect(res.statusCode).toBe(404);
                    done();
                });

                ws.on('open', () => {
                    done(new Error('Should not have connected to non-WS domain'));
                });
            }, 100);
        });

        it('should allow WebSocket without API key when api_key_required is false', (done) => {
            gateway = startGateway();
            gateway.addDomain('public.test', `ws://localhost:${WS_SERVER_PORT}`, {
                ws: true,
                api_key_required: false
            });

            setTimeout(() => {
                const ws = new WebSocket(
                    `ws://localhost:${GATEWAY_PORT}/`,
                    { headers: { 'Host': 'public.test' } }
                );

                ws.on('open', () => {
                    ws.send('public test');
                });

                ws.on('message', (data) => {
                    expect(data.toString()).toBe('echo: public test');
                    ws.close();
                    done();
                });

                ws.on('error', (err) => {
                    done(err);
                });
            }, 100);
        });
    });
});
