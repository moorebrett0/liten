const request = require('supertest');
const express = require('express');
const { startGateway, stopGateway } = require('../gateway');
const { addKey, removeKey } = require('../keys');
const path = require('path');
const fs = require('fs');

describe('Gateway Core', () => {
  let gateway;
  const TEST_PORT = 8080;
  const JSON_PLACEHOLDER_API = 'https://jsonplaceholder.typicode.com';
  
  beforeEach(() => {
    // Clean up any previous server instances
    stopGateway();
  });

  afterEach(() => {
    // Clean up after each test
    if (gateway && gateway.close) {
      gateway.close();
    }
    stopGateway();
  });

  describe('Domain-based routing', () => {
    it('should route requests based on host header', async () => {
      gateway = startGateway();
      gateway.addDomain('api.test', JSON_PLACEHOLDER_API);
      
      // Add a test API key since domain routes now require them
      const testKey = 'test-key-' + Date.now();
      addKey(testKey);

      const response = await request(`http://localhost:${TEST_PORT}`)
        .get('/posts/1')
        .set('Host', 'api.test')
        .set('x-api-key', testKey);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', 1);
      
      removeKey(testKey);
    });

    it('should return 404 for unknown domains', async () => {
      gateway = startGateway();
      
      const response = await request(`http://localhost:${TEST_PORT}`)
        .get('/posts/1')
        .set('Host', 'unknown.local');

      expect(response.status).toBe(404);
    });
  });

  describe('API Key Authentication', () => {
    const testKey = 'test-api-key-123';
    
    beforeEach(() => {
      // Add test API key
      addKey(testKey);
    });

    afterEach(() => {
      // Clean up test API key
      removeKey(testKey);
    });

    it('should allow requests with valid API key in header', async () => {
      gateway = startGateway();
      gateway.addDomain('api.test', JSON_PLACEHOLDER_API);

      const response = await request(`http://localhost:${TEST_PORT}`)
        .get('/posts/1')
        .set('Host', 'api.test')
        .set('x-api-key', testKey);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', 1);
    });

    it('should allow requests with valid API key in query', async () => {
      gateway = startGateway();
      gateway.addDomain('api.test', JSON_PLACEHOLDER_API);

      const response = await request(`http://localhost:${TEST_PORT}`)
        .get('/posts/1?key=' + testKey)
        .set('Host', 'api.test');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', 1);
    });

    it('should reject requests with invalid API key', async () => {
      gateway = startGateway();
      gateway.addDomain('api.test', JSON_PLACEHOLDER_API);

      const response = await request(`http://localhost:${TEST_PORT}`)
        .get('/posts/1')
        .set('Host', 'api.test')
        .set('x-api-key', 'invalid-key');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject requests with missing API key when required', async () => {
      gateway = startGateway();
      gateway.addDomain('api.test', JSON_PLACEHOLDER_API);

      const response = await request(`http://localhost:${TEST_PORT}`)
        .get('/posts/1')
        .set('Host', 'api.test');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      gateway = startGateway();
      gateway.addDomain('rate.test', JSON_PLACEHOLDER_API);
      
      const testKey = 'rate-test-key';
      addKey(testKey);
      
      // Make 6 requests quickly to trigger rate limit
      const requests = [];
      for (let i = 0; i < 6; i++) {
        requests.push(
          request(`http://localhost:${TEST_PORT}`)
            .get('/posts/' + (i + 1))
            .set('Host', 'rate.test')
            .set('x-api-key', testKey)
        );
      }

      const responses = await Promise.all(requests);
      
      // First 5 should succeed (our rate limit is 5)
      responses.slice(0, 5).forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('id');
      });

      // 6th request should be rate limited
      expect(responses[5].status).toBe(429);
      
      removeKey(testKey);
    });

    it('should track rate limits by API key', async () => {
      gateway = startGateway();
      gateway.addDomain('rate.test', JSON_PLACEHOLDER_API);
      
      const key1 = 'test-key-1';
      const key2 = 'test-key-2';
      addKey(key1);
      addKey(key2);

      // Make requests with different API keys
      const responses = await Promise.all([
        request(`http://localhost:${TEST_PORT}`).get('/posts/1').set('Host', 'rate.test').set('x-api-key', key1),
        request(`http://localhost:${TEST_PORT}`).get('/posts/2').set('Host', 'rate.test').set('x-api-key', key1),
        request(`http://localhost:${TEST_PORT}`).get('/posts/3').set('Host', 'rate.test').set('x-api-key', key2),
      ]);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('id');
      });

      removeKey(key1);
      removeKey(key2);
    });
  });

  describe('CORS Support', () => {
    it('should handle CORS preflight requests', async () => {
      gateway = startGateway();
      gateway.addDomain('cors.test', JSON_PLACEHOLDER_API);

      const response = await request(`http://localhost:${TEST_PORT}`)
        .options('/posts/1')
        .set('Host', 'cors.test')
        .set('Origin', 'http://example.com')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
    });

    it('should add CORS headers to regular responses', async () => {
      gateway = startGateway();
      gateway.addDomain('cors.test', JSON_PLACEHOLDER_API);
      
      const testKey = 'cors-test-key';
      addKey(testKey);

      const response = await request(`http://localhost:${TEST_PORT}`)
        .get('/posts/1')
        .set('Host', 'cors.test')
        .set('Origin', 'http://example.com')
        .set('x-api-key', testKey);

      // The external API reflects the origin header instead of using *
      // This is normal behavior for many APIs
      expect(response.headers['access-control-allow-origin']).toBe('http://example.com');
      expect(response.body).toHaveProperty('id', 1);
      
      removeKey(testKey);
    });
  });
});
