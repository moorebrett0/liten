# Liten

**A tiny, developer-friendly API gateway CLI for local dev, IoT, and small teams.**

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## What is Liten?

**Liten** (“small” in Nordic languages) is a lightweight, config-driven API gateway you can run anywhere—your laptop, Raspberry Pi, cloud VM, or dev server.

* 🔑 **API key authentication**
* ⚡ **Per-route rate limiting**
* 🌐 **Reverse proxy to any backend API**
* 📜 **Request/response logging**
* 🧑‍💻 **Interactive CLI shell**

> **Liten is perfect for solo devs, hobbyists, educators, or anyone who needs simple, local API security and observability.**

---

## Quickstart

1. **Install:**

   ```sh
   npm install -g liten
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

---

## CLI Commands

Inside the Liten shell:

* `status` — Show gateway status
* `list-keys` — List all API keys
* `add-key <key>` — Add an API key
* `remove-key <key>` — Remove an API key
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
Please file bugs, feature requests, and suggestions on [GitHub Issues](https://github.com/yourusername/liten/issues).

---

## License

MIT License © [Your Name](https://github.com/yourusername)
