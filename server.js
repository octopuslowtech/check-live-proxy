const express = require('express');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const TIMEOUT = 10000;
const CONCURRENCY = 50;

// Default values
const DEFAULT_CHECK_TIMES = 5;
const DEFAULT_CHECK_INTERVAL = 5000;
const DEFAULT_MIN_SUCCESS = 3;
const DEFAULT_TARGET_URL = 'https://www.tiktok.com';
const IP_CHECK_URL = 'https://ipconfig.io/json';

function parseProxy(proxyStr) {
  const parts = proxyStr.trim().split(':');
  if (parts.length === 2) {
    return { host: parts[0], port: parseInt(parts[1]), auth: null };
  } else if (parts.length === 4) {
    return {
      host: parts[0],
      port: parseInt(parts[1]),
      auth: { username: parts[2], password: parts[3] }
    };
  }
  return null;
}

function checkProxyOnce(proxy, targetUrl) {
  return new Promise((resolve) => {
    const url = new URL(targetUrl);
    const isHttps = url.protocol === 'https:';
    
    const connectOptions = {
      host: proxy.host,
      port: proxy.port,
      method: 'CONNECT',
      path: `${url.hostname}:${isHttps ? 443 : 80}`,
      timeout: TIMEOUT,
      headers: {
        'Host': `${url.hostname}:${isHttps ? 443 : 80}`,
        'Proxy-Connection': 'keep-alive'
      }
    };

    if (proxy.auth) {
      const auth = Buffer.from(`${proxy.auth.username}:${proxy.auth.password}`).toString('base64');
      connectOptions.headers['Proxy-Authorization'] = `Basic ${auth}`;
    }

    const req = http.request(connectOptions);
    let resolved = false;

    const done = (success, ip = null) => {
      if (!resolved) {
        resolved = true;
        resolve({ success, ip });
      }
    };

    req.on('connect', (res, socket) => {
      if (res.statusCode === 200) {
        if (isHttps) {
          const tlsOptions = {
            socket: socket,
            servername: url.hostname,
            timeout: TIMEOUT
          };

          const tlsSocket = require('tls').connect(tlsOptions, () => {
            tlsSocket.write(`GET ${url.pathname || '/'} HTTP/1.1\r\nHost: ${url.hostname}\r\nConnection: close\r\n\r\n`);
          });

          let responseData = '';
          tlsSocket.on('data', (chunk) => {
            responseData += chunk.toString();
          });

          tlsSocket.on('end', () => {
            tlsSocket.destroy();
            socket.destroy();
            
            // Try to extract IP from ipconfig.io response
            let ip = null;
            if (targetUrl.includes('ipconfig.io')) {
              try {
                const bodyMatch = responseData.match(/\{[\s\S]*\}/);
                if (bodyMatch) {
                  const json = JSON.parse(bodyMatch[0]);
                  ip = json.ip;
                }
              } catch (e) {}
            }
            
            if (responseData.includes('HTTP/1.1') || responseData.includes('HTTP/2')) {
              done(true, ip);
            } else {
              done(false);
            }
          });

          tlsSocket.on('error', () => {
            socket.destroy();
            done(false);
          });

          tlsSocket.on('timeout', () => {
            tlsSocket.destroy();
            socket.destroy();
            done(false);
          });

          setTimeout(() => {
            if (responseData.length > 0) {
              let ip = null;
              if (targetUrl.includes('ipconfig.io')) {
                try {
                  const bodyMatch = responseData.match(/\{[\s\S]*\}/);
                  if (bodyMatch) {
                    const json = JSON.parse(bodyMatch[0]);
                    ip = json.ip;
                  }
                } catch (e) {}
              }
              done(true, ip);
            } else {
              done(false);
            }
            tlsSocket.destroy();
            socket.destroy();
          }, TIMEOUT);
        } else {
          // HTTP request
          socket.write(`GET ${url.pathname || '/'} HTTP/1.1\r\nHost: ${url.hostname}\r\nConnection: close\r\n\r\n`);
          
          let responseData = '';
          socket.on('data', (chunk) => {
            responseData += chunk.toString();
            if (responseData.includes('HTTP/1.1') || responseData.includes('HTTP/2')) {
              socket.destroy();
              done(true);
            }
          });

          socket.on('error', () => done(false));
          socket.on('timeout', () => {
            socket.destroy();
            done(false);
          });

          setTimeout(() => {
            if (responseData.length > 0) {
              done(true);
            } else {
              done(false);
            }
            socket.destroy();
          }, TIMEOUT);
        }
      } else {
        socket.destroy();
        done(false);
      }
    });

    req.on('error', () => done(false));
    req.on('timeout', () => {
      req.destroy();
      done(false);
    });

    req.setTimeout(TIMEOUT);
    req.end();
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatProxy(proxy) {
  if (proxy.auth) {
    return `${proxy.host}:${proxy.port}:${proxy.auth.username}:${proxy.auth.password}`;
  }
  return `${proxy.host}:${proxy.port}`;
}

async function checkProxyMultiple(proxy, config, sendUpdate) {
  const proxyStr = formatProxy(proxy);
  let successCount = 0;
  const results = [];
  let lastIp = null;

  for (let i = 0; i < config.checkTimes; i++) {
    const result = await checkProxyOnce(proxy, config.targetUrl);
    if (result.success) {
      successCount++;
      if (result.ip) lastIp = result.ip;
    }
    results.push(result.success ? '✓' : '✗');

    sendUpdate({
      type: 'check',
      proxy: proxyStr,
      round: i + 1,
      totalRounds: config.checkTimes,
      success: result.success,
      successCount,
      results: results.join(' '),
      ip: lastIp
    });

    if (i < config.checkTimes - 1) {
      await delay(config.checkInterval);
    }
  }

  const isLive = successCount > config.minSuccess;
  return { proxy: proxyStr, live: isLive, successCount, results, ip: lastIp };
}

app.post('/api/check', async (req, res) => {
  const { 
    proxies: proxyList, 
    useCustomDomain = false,
    customDomain = '',
    checkTimes = DEFAULT_CHECK_TIMES,
    checkInterval = DEFAULT_CHECK_INTERVAL,
    minSuccess = DEFAULT_MIN_SUCCESS
  } = req.body;
  
  if (!proxyList || !Array.isArray(proxyList)) {
    return res.status(400).json({ error: 'Invalid proxy list' });
  }

  const proxies = proxyList
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(parseProxy)
    .filter(p => p !== null);

  if (proxies.length === 0) {
    return res.status(400).json({ error: 'No valid proxies found' });
  }

  // Determine target URL
  let targetUrl;
  if (useCustomDomain && customDomain) {
    targetUrl = customDomain.startsWith('http') ? customDomain : `https://${customDomain}`;
  } else {
    targetUrl = IP_CHECK_URL;
  }

  const config = {
    targetUrl,
    checkTimes: parseInt(checkTimes) || DEFAULT_CHECK_TIMES,
    checkInterval: parseInt(checkInterval) || DEFAULT_CHECK_INTERVAL,
    minSuccess: parseInt(minSuccess) || DEFAULT_MIN_SUCCESS
  };

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendUpdate = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const results = { live: [], die: [] };
  let completed = 0;
  const total = proxies.length;

  sendUpdate({ 
    type: 'start', 
    total, 
    checkTimes: config.checkTimes, 
    interval: config.checkInterval / 1000,
    minSuccess: config.minSuccess,
    targetUrl: config.targetUrl
  });

  const batchSize = CONCURRENCY;
  
  for (let i = 0; i < proxies.length; i += batchSize) {
    const batch = proxies.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (proxy) => {
      const result = await checkProxyMultiple(proxy, config, sendUpdate);
      
      if (result.live) {
        results.live.push({ proxy: result.proxy, ip: result.ip });
      } else {
        results.die.push({ proxy: result.proxy, ip: result.ip });
      }
      
      completed++;
      
      sendUpdate({
        type: 'result',
        proxy: result.proxy,
        live: result.live,
        successCount: result.successCount,
        results: result.results,
        ip: result.ip,
        completed,
        total,
        liveCount: results.live.length,
        dieCount: results.die.length
      });
    });

    await Promise.all(batchPromises);
  }

  sendUpdate({ type: 'complete', results });
  res.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Proxy Checker running at http://localhost:${PORT}`);
});
