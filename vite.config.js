import { defineConfig } from 'vite';
import dns from 'node:dns';
import { Agent } from 'node:https';

// Force IPv4 first — fixes ETIMEDOUT on Node 18+ (IPv6 fallback issue)
dns.setDefaultResultOrder('ipv4first');

export default defineConfig({
    server: {
        proxy: {
            '/api/v1': {
                target: 'http://localhost:8000',
                changeOrigin: true,
                secure: false,
            },
            '/api': {
                target: 'https://haveibeenransom.com',
                changeOrigin: true,
                secure: false,
                agent: new Agent({ family: 4, rejectUnauthorized: false }),
            },
        },
    },
});
