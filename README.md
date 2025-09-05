<div align="center">
  <img src="assets/liten-logo.png" alt="Liten" width="300">
  
  **A tiny, developer-friendly API gateway CLI for local dev, IoT, and small teams.**
</div>

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## What is Liten?

**Liten** (“small” in Nordic languages) is a lightweight, config-driven API gateway you can run anywhere: your laptop, Raspberry Pi, cloud VM, or dev server.

*  **API key authentication**
*  **Per-route rate limiting**
*  **Reverse proxy to any backend API**
*  **Request/response logging**
*  **Interactive CLI shell**

> **Liten is perfect for solo devs, hobbyists, educators, or anyone who needs simple, local API security and observability.**

---

## Quickstart

1. **Install:**

   ```sh
   npm install -g liten-gateway
   ```

2. **Set up your `config.yaml`:**

   ```yaml
   port: 8080
   routes:
     /openai:
       target: https://api.openai.com/v1/
       api_key_required: true
       rate_limit: 60
     /weather:
       target: https://api.weather.com/v2/
       api_key_required: false
       rate_limit: 10
   ```

3. **Start the gateway (interactive shell mode):**

   ```sh
   liten
   ```

4. **Manage API keys:**

   ```sh
   Liten > add-key mytestkey
   Liten > list-keys
   Liten > remove-key mytestkey
   ```

5. **Classic/daemon mode:**

   ```sh
   liten start
   ```

---

## Features

* **API key authentication** (per route or global)
* **Per-route rate limiting**
* **Reverse proxy to HTTP/HTTPS APIs**
* **CORS and header control**
* **Interactive CLI shell (one terminal for all management)**
* **Simple YAML/JSON config**
* **Runs anywhere Node.js does**
* **Domain based routing** (new in 1.1.0)
* **ngrok integration** for instant public tunnels (new in 1.2.0)

---

## CLI Commands

Inside the Liten shell:

* `status` — Show gateway status
* `list-keys` — List all API keys
* `add-key <key>` — Add an API key
* `remove-key <key>` — Remove an API key
* `add-domain <host> <target>`  - Add a new domain route
* `remove-domain <host>` - Remove a domain route
* `list-domains` - List all configured domains
* `show-domain <host>` - Show the target for a specific domain
* `start-tunnel [opts]` — Start ngrok tunnel (see ngrok section for options)
* `stop-tunnel` — Stop ngrok tunnel
* `tunnel-status` — Show tunnel status
* `logs [n]` — Show the last n log lines (default: 10)
* `reload` — Reload config file
* `help` — Show all commands
* `exit` — Exit Liten

---

## Example: Adding an OpenAI Proxy

In your `config.yaml`:

```yaml
routes:
  /openai:
    target: https://api.openai.com/v1/
    api_key_required: true
    rate_limit: 60
```

Now all requests to `http://localhost:8080/openai/...` are authenticated, rate-limited, and logged.

---

## CORS and Header Control

Liten supports per-route CORS handling and custom request headers, easily configured in your YAML.

### **Enable CORS**

To enable CORS on a route, just add `cors: true`:

```yaml
routes:
  /openai:
    target: https://api.openai.com/v1/
    api_key_required: true
    rate_limit: 60
    cors: true
```

This allows requests from any origin to that route.

---

## 🚦 Domain-Based Routing

**New in v1.1.0:**
`liten` now supports domain-based routing, making it easy to route requests by hostname or subdomain—just like a lightweight alternative to nginx for simple projects!

### How Domain Routing Works

You can define domain proxies that route incoming requests based on the `Host` header. These rules take priority over regular path routes.

#### Programmatic Example

```js
const { startGateway } = require('./gateway');
const gw = startGateway();

// Add a domain route
gw.addDomain('api.myapp.local', 'http://localhost:4001');
gw.addDomain('admin.myapp.local', 'http://localhost:4002');

// Optional: set a fallback for unmatched domains
gw.addDomain('*', 'http://localhost:3000');

// Remove a domain route
gw.removeDomain('admin.myapp.local');

// List all domains
console.log(gw.listDomains());
```

### Interactive Shell Commands

You can also manage domains directly from the interactive shell:

**Examples:**

```
Liten > add-domain api.localhost http://localhost:3001
Liten > add-domain '*' http://localhost:3000
Liten > list-domains
api.localhost -> http://localhost:3001
*            -> http://localhost:3000
Liten > remove-domain api.localhost
```

### How It Works

* If a request matches a configured domain (by `Host` header), it is proxied to the specified target.
* If no domain matches, the gateway will fall back to path-based routing as defined in your config file.
* You can add, remove, and list domains live without restarting the gateway!

---

**Pro Tip:**
Combine domain and path routing for maximum flexibility—run multiple microservices, dev APIs, or frontends from a single gateway, using simple interactive commands or code!

---

## 🌐 ngrok Integration

**New in v1.2.0:**
Liten now includes built-in ngrok integration, making it incredibly easy to expose your local gateway to the internet with a single command. Perfect for sharing demos, webhooks, testing with external services, or remote development.

### Quick Start with ngrok

1. **Get your ngrok authtoken:**
   - Sign up at: https://dashboard.ngrok.com/signup
   - Get your authtoken: https://dashboard.ngrok.com/get-started/your-authtoken

2. **Start your gateway:**
   ```sh
   liten
   ```

3. **Create a public tunnel:**
   ```sh
   Liten > start-tunnel --authtoken=your_authtoken_here
   ✅ Tunnel started successfully!
   🌐 Public URL: https://abc123.ngrok.app
   📍 Local: localhost:8080
   ```

4. **Your API is now publicly accessible!**
   - All your configured routes work through the tunnel
   - API keys, rate limiting, and CORS all work as expected
   - Share the ngrok URL with anyone

### ngrok Commands

* **`start-tunnel [options]`** - Start an ngrok tunnel
  - `--authtoken=<token>` - Use your ngrok authtoken
  - `--domain=<domain>` - Use a custom/reserved domain
  - `--subdomain=<name>` - Request a specific subdomain
  - `--region=<region>` - Choose region (us, eu, ap, au, sa, jp, in)

* **`stop-tunnel`** - Stop the current tunnel

* **`tunnel-status`** - Show tunnel details and uptime

### Authtoken Setup

You can provide your ngrok authtoken in several ways:

**Method 1: Command line option**
```sh
Liten > start-tunnel --authtoken=your_authtoken_here
```

**Method 2: Environment variable**
```sh
export NGROK_AUTHTOKEN=your_authtoken_here
liten
Liten > start-tunnel  # Will use the environment variable
```

**Method 3: Config file**
```yaml
ngrok:
  authtoken: your_authtoken_here
```

### Examples

**Basic tunnel (with authtoken in environment or config):**
```sh
Liten > start-tunnel
```

**With custom domain (requires ngrok Pro):**
```sh
Liten > start-tunnel --domain=myapi.ngrok.app
```

**With authtoken and region:**
```sh
Liten > start-tunnel --authtoken=your_token --region=eu
```

### Auto-start Tunnels

You can configure Liten to automatically start an ngrok tunnel when the gateway starts by editing your `config.yaml`:

```yaml
port: 8080
ngrok:
  auto_start: true
  authtoken: your_ngrok_authtoken  # optional
  domain: myapi.ngrok.app         # optional
  region: us                      # optional
routes:
  # ... your routes
```

With `auto_start: true`, Liten will automatically create a public tunnel every time you start the gateway.

### Use Cases

* **Demo your API** - Share your work instantly with clients or team members
* **Webhook development** - Test webhooks from external services like GitHub, Stripe, etc.
* **Mobile app testing** - Test your local API from mobile devices
* **Remote development** - Access your local gateway from anywhere
* **Quick prototyping** - Share prototypes without deploying

### Security Notes

* ngrok tunnels are public by default - anyone with the URL can access your API
* Use API key authentication for secure endpoints
* Consider using custom domains for professional presentations
* Monitor tunnel activity through the `tunnel-status` command

---

### **Add Custom Headers**

You can add arbitrary headers to proxied requests using a `headers:` block:

```yaml
routes:
  /weather:
    target: https://api.weather.com/v2/
    api_key_required: false
    rate_limit: 10
    cors: true
    headers:
      X-My-Header: MyValue
      X-Requested-With: liten
```

All headers listed under `headers:` will be set on requests sent to your target API.

---

### **How It Works**

* `cors: true` automatically adds `Access-Control-Allow-Origin: *` and related CORS headers.
* All `headers:` values are injected into outgoing proxied requests for that route.
* CORS and headers are configured independently for each route.

---

**Example: Full Route with CORS and Custom Headers**

```yaml
routes:
  /example:
    target: https://api.example.com/
    api_key_required: true
    rate_limit: 20
    cors: true
    headers:
      X-Custom-Token: abcdef12345
      X-Requested-With: liten
```


## Logging

* Logs are written to `gateway.log` in your project directory.
* View logs with `logs 20` in the shell, or tail with `tail -f gateway.log`.

---

## Contributing

We welcome contributions! Here's how to get started:

### Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/moorebrett0/liten.git
   cd liten
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run tests:**
   ```bash
   npm test
   ```

### Testing

Liten includes comprehensive tests to ensure reliability:

- **Unit Tests**: Test individual components and functions
- **Integration Tests**: Test the full gateway functionality including API key auth, rate limiting, CORS, and domain routing
- **CLI Tests**: Test the interactive shell commands

**Test Commands:**
```bash
# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

**Test Structure:**
- `bin/__tests__/` - CLI and shell command tests
- `lib/__tests__/` - Core gateway functionality tests
- Tests use Jest and Supertest for HTTP testing
- All tests include proper cleanup to prevent memory leaks

### Before Submitting a PR

1. **Run the test suite** - All tests must pass
2. **Add tests** for new features or bug fixes
3. **Follow existing code style** - We use standard JavaScript conventions
4. **Update documentation** if you're adding/changing features

### What We're Looking For

- Bug fixes with accompanying tests
- New features that enhance the gateway's capabilities
- Performance improvements
- Documentation improvements
- Better error handling

### Reporting Issues

Please file bugs, feature requests, and suggestions on [GitHub Issues](https://github.com/moorebrett0/liten/issues).

When reporting bugs, please include:
- Node.js version
- Operating system
- Steps to reproduce
- Expected vs actual behavior

---

## License

MIT License © [Brett Moore](https://github.com/moorebrett0)
