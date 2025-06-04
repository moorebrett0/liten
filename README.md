# Liten

**A tiny, developer-friendly API gateway CLI for local dev, IoT, and small teams.**

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

## Contribution

PRs and issues welcome!
Please file bugs, feature requests, and suggestions on [GitHub Issues](https://github.com/moorebrett0/liten/issues).

---

## License

MIT License © [Brett Moore](https://github.com/moorebrett0)
