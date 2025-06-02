const http = require('http');
const https = require('https');
const url = require('url');

let webhookData = [];

// Google Apps Script URL (als Umgebungsvariable setzen)
const GAS_URL = process.env.GAS_URL || 'https://script.google.com/macros/s/AKfycbzIZbg87UoPo8X9FGvaYmht0GNupn_ShOrdx7KaO6vWWxaj1Qrr11D2zPPQuJOp1RNp/exec';

// Funktion um LINE ID an Google Apps Script zu senden
function sendLineIdToGAS(userId) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      action: 'updateLineId',
      userId: userId,
      timestamp: new Date().toISOString()
    });
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    // URL parsen für HTTPS Request
    const gasUrl = new URL(GAS_URL);
    options.hostname = gasUrl.hostname;
    options.path = gasUrl.pathname + gasUrl.search;
    options.port = 443;

    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        console.log('✅ GAS Response für LINE ID:', responseData);
        resolve({
          status: res.statusCode,
          data: responseData
        });
      });
    });

    req.on('error', (error) => {
      console.error('❌ GAS Request Fehler:', error);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', reject);
  });
}

async function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Line-Signature');

  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    console.log('Request:', method, path);

    // Homepage
    if (path === '/' && method === 'GET') {
      const projectName = process.env.PROJECT_DOMAIN || 'dein-projekt-name';
      const response = {
        status: 'LINE ID Collector läuft',
        message: 'Sammelt LINE User IDs und schreibt sie in meinichi_data',
        time: new Date().toISOString(),
        lineWebhookUrl: 'https://' + projectName + '.glitch.me/line-webhook',
        gasConfigured: GAS_URL !== 'https://script.google.com/macros/s/AKfycbyMYVdGSIB1zeDWijs3-qm3v-WKYXGw9hgvE87eSc1yvAH8-X0M8szyqixlvv8ThCON8g/exec',
        totalWebhooks: webhookData.length,
        uniqueUsers: [...new Set(webhookData.map(w => w.userId).filter(Boolean))].length
      };
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response, null, 2));
      return;
    }

    // LINE Webhook - fokussiert auf User ID sammeln
    if (path === '/line-webhook' && method === 'POST') {
      const body = await getBody(req);
      console.log('📱 LINE Webhook empfangen');

      let parsedBody;
      try {
        parsedBody = JSON.parse(body);
      } catch (e) {
        console.error('❌ JSON Parse Fehler:', e);
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid JSON');
        return;
      }

      // Webhook-Daten für Logging speichern
      const entry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        type: 'LINE',
        signature: req.headers['x-line-signature'],
        events: parsedBody && parsedBody.events ? parsedBody.events : [],
        processedUsers: []
      };

      // LINE Events verarbeiten - fokussiert auf User ID sammeln
      if (parsedBody && parsedBody.events && parsedBody.events.length > 0) {
        for (const event of parsedBody.events) {
          console.log(`📨 LINE Event: ${event.type}`);
          
          // User ID extrahieren
          let userId = null;
          if (event.source && event.source.userId) {
            userId = event.source.userId;
          }

          if (userId) {
            console.log(`👤 User ID gefunden: ${userId}`);
            
            try {
              // User ID an Google Apps Script senden
              console.log('📤 Sende User ID an GAS...');
              const gasResponse = await sendLineIdToGAS(userId);
              
              entry.processedUsers.push({
                userId: userId,
                eventType: event.type,
                gasResponse: gasResponse,
                success: true
              });
              
              console.log(`✅ User ID ${userId} erfolgreich an GAS gesendet`);

            } catch (gasError) {
              console.error(`❌ Fehler beim Senden der User ID ${userId}:`, gasError);
              entry.processedUsers.push({
                userId: userId,
                eventType: event.type,
                error: gasError.message,
                success: false
              });
            }
          } else {
            console.log(`⚠️ Keine User ID in Event ${event.type} gefunden`);
          }
        }
      }

      webhookData.push(entry);
      
      // Nur letzte 50 Einträge behalten
      if (webhookData.length > 50) {
        webhookData = webhookData.slice(-50);
      }

      // LINE erwartet einfache OK Antwort
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
      return;
    }

    // Test-Endpoint für manuelle User ID Tests
    if (path === '/test-userid' && method === 'POST') {
      const body = await getBody(req);
      
      let testData;
      try {
        testData = JSON.parse(body);
      } catch (e) {
        testData = { userId: 'U1234567890abcdef' }; // Fallback Test-ID
      }

      const userId = testData.userId;
      
      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'userId erforderlich' }));
        return;
      }

      try {
        console.log(`🧪 Test: Sende User ID ${userId} an GAS`);
        const gasResponse = await sendLineIdToGAS(userId);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'User ID erfolgreich getestet',
          userId: userId,
          gasResponse: gasResponse
        }, null, 2));
        
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: error.message,
          userId: userId
        }, null, 2));
      }
      return;
    }

    // Webhook-Daten und User Statistiken anzeigen
    if (path === '/data' && method === 'GET') {
      // Alle User IDs sammeln
      const allUserIds = [];
      webhookData.forEach(entry => {
        entry.processedUsers.forEach(user => {
          if (user.userId) {
            allUserIds.push(user.userId);
          }
        });
      });
      
      const uniqueUserIds = [...new Set(allUserIds)];
      
      const response = {
        total: webhookData.length,
        data: webhookData.slice(-10).reverse(),
        statistics: {
          totalUserInteractions: allUserIds.length,
          uniqueUsers: uniqueUserIds.length,
          uniqueUserIds: uniqueUserIds
        },
        gasConfigured: GAS_URL !== 'https://script.google.com/macros/s/AKfycbyMYVdGSIB1zeDWijs3-qm3v-WKYXGw9hgvE87eSc1yvAH8-X0M8szyqixlvv8ThCON8g/exec'
      };
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response, null, 2));
      return;
    }

    // Test-Interface
    if (path === '/test-form' && method === 'GET') {
      const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>LINE ID Collector - meinichi_data</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            max-width: 1000px; 
            margin: 0 auto; 
            padding: 20px; 
            background: #f5f5f5; 
        }
        .container { 
            background: white; 
            padding: 20px; 
            margin: 20px 0; 
            border-radius: 8px; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.1); 
        }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
        button { 
            background: #00c851; 
            color: white; 
            padding: 10px 20px; 
            border: none; 
            border-radius: 4px; 
            cursor: pointer; 
            margin: 5px; 
        }
        button:hover { background: #007e33; }
        .test-btn { background: #007bff; }
        .test-btn:hover { background: #0056b3; }
        .delete { background: #dc3545; }
        .delete:hover { background: #c82333; }
        input, textarea { 
            width: 100%; 
            padding: 10px; 
            margin: 10px 0; 
            border: 1px solid #ddd; 
            border-radius: 4px; 
            font-family: monospace; 
        }
        .result { 
            background: #f8f9fa; 
            padding: 15px; 
            border-radius: 4px; 
            margin: 10px 0; 
            border-left: 4px solid #007bff; 
        }
        .webhook-item { 
            background: #f9f9f9; 
            padding: 15px; 
            margin: 10px 0; 
            border-radius: 4px; 
            border-left: 4px solid #00c851; 
        }
        .user-success { border-left-color: #28a745; }
        .user-error { border-left-color: #dc3545; }
        .time { color: #666; font-size: 0.9em; }
        .status { 
            display: inline-block; 
            padding: 2px 8px; 
            border-radius: 12px; 
            font-size: 0.8em; 
            color: white; 
            margin-left: 10px; 
        }
        .status.success { background: #28a745; }
        .status.error { background: #dc3545; }
        .stats { 
            background: #e7f3ff; 
            padding: 15px; 
            border-radius: 4px; 
            margin: 15px 0; 
        }
        pre { 
            background: #f8f9fa; 
            padding: 10px; 
            border-radius: 4px; 
            overflow-x: auto; 
            max-height: 200px; 
            overflow-y: auto; 
        }
    </style>
</head>
<body>
    <h1>📱 LINE ID Collector für meinichi_data</h1>
    
    <div class="container">
        <h3>📡 Konfiguration</h3>
        <p><strong>LINE Webhook URL:</strong> <code>${req.headers.host}/line-webhook</code></p>
        <p><strong>Ziel-Tabelle:</strong> <code>meinichi_data</code> - Spalte E (LINE ID)</p>
        <p id="gasStatus">⏳ Prüfe GAS Konfiguration...</p>
    </div>

    <div class="grid">
        <div class="container">
            <h3>🧪 Tests</h3>
            
            <h4>LINE Message Event simulieren:</h4>
            <textarea id="lineData">{
  "events": [{
    "type": "message",
    "timestamp": ${Date.now()},
    "source": {
      "type": "user",
      "userId": "bodaijuceo"
    },
    "message": {
      "type": "text",
      "text": "Hallo"
    },
    "replyToken": "test-reply-token"
  }]
}</textarea>
            <button onclick="send('/line-webhook', 'lineData')">📱 LINE Webhook simulieren</button>
            
            <h4>User ID direkt testen:</h4>
            <input type="text" id="testUserId" value="bodaijuceo" placeholder="User ID eingeben">
            <button onclick="testUserId()" class="test-btn">👤 User ID an GAS senden</button>
            
            <div id="result"></div>
        </div>

        <div class="container">
            <h3>📊 Gesammelte User IDs</h3>
            <button onclick="load()">🔄 Laden</button>
            <button onclick="clear()" class="delete">🗑️ Löschen</button>
            <div id="stats"></div>
            <div id="webhooks"></div>
        </div>
    </div>

    <script>
        window.onload = () => {
            load();
            checkGASStatus();
        };
        
        async function checkGASStatus() {
            try {
                const response = await fetch('/');
                const data = await response.json();
                const statusEl = document.getElementById('gasStatus');
                
                if (data.gasConfigured) {
                    statusEl.innerHTML = '✅ <strong>GAS URL konfiguriert</strong> - ' + data.uniqueUsers + ' unique Users gesammelt';
                    statusEl.style.color = 'green';
                } else {
                    statusEl.innerHTML = '⚠️ <strong>GAS URL nicht konfiguriert</strong> - Setze GAS_URL Umgebungsvariable';
                    statusEl.style.color = 'orange';
                }
            } catch (error) {
                document.getElementById('gasStatus').innerHTML = '❌ Fehler beim Prüfen der Konfiguration';
            }
        }
        
        async function send(url, dataElementId) {
            const data = document.getElementById(dataElementId).value || '{}';
            const result = document.getElementById('result');
            
            try {
                result.innerHTML = '⏳ Sende LINE Webhook...';
                
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Line-Signature': 'test-signature'
                    },
                    body: data
                });
                
                const responseData = await response.text();
                result.innerHTML = '<div class="result">Status: ' + response.status + '<br>Response: ' + responseData + '</div>';
                
                setTimeout(load, 1000);
                
            } catch (error) {
                result.innerHTML = '<div class="result" style="border-color: #dc3545;">Fehler: ' + error.message + '</div>';
            }
        }
        
        async function testUserId() {
            const userId = document.getElementById('testUserId').value;
            const result = document.getElementById('result');
            
            if (!userId) {
                result.innerHTML = '<div class="result" style="border-color: #dc3545;">Bitte User ID eingeben</div>';
                return;
            }
            
            try {
                result.innerHTML = '⏳ Sende User ID an GAS...';
                
                const response = await fetch('/test-userid', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: userId })
                });
                
                const responseData = await response.json();
                result.innerHTML = '<div class="result">Status: ' + response.status + '<br><pre>' + JSON.stringify(responseData, null, 2) + '</pre></div>';
                
                setTimeout(load, 1000);
                
            } catch (error) {
                result.innerHTML = '<div class="result" style="border-color: #dc3545;">Fehler: ' + error.message + '</div>';
            }
        }
        
        async function load() {
            try {
                const response = await fetch('/data');
                const data = await response.json();
                
                // Statistiken anzeigen
                const statsDiv = document.getElementById('stats');
                if (data.statistics) {
                    statsDiv.innerHTML = '<div class="stats">' +
                        '<strong>📊 Statistiken:</strong><br>' +
                        'Gesamt Interaktionen: ' + data.statistics.totalUserInteractions + '<br>' +
                        'Unique Users: ' + data.statistics.uniqueUsers + '<br>' +
                        'User IDs: ' + data.statistics.uniqueUserIds.join(', ') +
                        '</div>';
                }
                
                // Webhook-Daten anzeigen
                const container = document.getElementById('webhooks');
                if (data.data && data.data.length > 0) {
                    container.innerHTML = '<p><strong>Letzte Webhooks:</strong></p>' + 
                        data.data.map(function(item) {
                            const userCount = item.processedUsers ? item.processedUsers.length : 0;
                            const successCount = item.processedUsers ? item.processedUsers.filter(u => u.success).length : 0;
                            
                            return '<div class="webhook-item">' +
                                '<div class="time">🕒 ' + new Date(item.timestamp).toLocaleString() + '</div>' +
                                '<div><strong>Events:</strong> ' + item.events.length + ' | <strong>User IDs verarbeitet:</strong> ' + userCount + ' (' + successCount + ' erfolgreich)</div>' +
                                (item.processedUsers && item.processedUsers.length > 0 ? 
                                    '<div><strong>Users:</strong> ' + item.processedUsers.map(u => 
                                        u.userId + (u.success ? ' ✅' : ' ❌')
                                    ).join(', ') + '</div>' : '') +
                                '<details><summary>Details anzeigen</summary>' +
                                '<pre>' + JSON.stringify(item, null, 2) + '</pre></details>' +
                                '</div>';
                        }).join('');
                } else {
                    container.innerHTML = '<p>📭 Noch keine Webhooks empfangen</p>';
                }
            } catch (error) {
                document.getElementById('webhooks').innerHTML = '<p style="color: red;">Fehler: ' + error.message + '</p>';
            }
        }
        
        async function clear() {
            if (!confirm('Alle Webhook-Daten löschen?')) return;
            
            try {
                const response = await fetch('/data', { method: 'DELETE' });
                const result = await response.json();
                alert(result.message);
                load();
            } catch (error) {
                alert('Fehler: ' + error.message);
            }
        }
        
        setInterval(load, 30000);
    </script>
</body>
</html>`;
      
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }

    // Health Check
    if (path === '/health' && method === 'GET') {
      const response = {
        status: 'OK',
        service: 'LINE ID Collector',
        uptime: process.uptime(),
        webhooks: webhookData.length,
        gasConfigured: GAS_URL !== 'https://script.google.com/macros/s/AKfycbyMYVdGSIB1zeDWijs3-qm3v-WKYXGw9hgvE87eSc1yvAH8-X0M8szyqixlvv8ThCON8g/exec',
        timestamp: new Date().toISOString()
      };
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response, null, 2));
      return;
    }

    // Daten löschen
    if (path === '/data' && method === 'DELETE') {
      const count = webhookData.length;
      webhookData = [];
      const response = { 
        success: true, 
        message: count + ' Webhook-Einträge gelöscht' 
      };
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
      return;
    }

    // 404 Not Found
    const notFoundResponse = {
      error: 'Not Found',
      path: path,
      routes: ['/', '/line-webhook', '/test-userid', '/test-form', '/data', '/health']
    };
    
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(notFoundResponse, null, 2));

  } catch (error) {
    console.error('Request error:', error);
    
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Internal Server Error', 
      message: error.message 
    }));
  }
}

const server = http.createServer(handleRequest);

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log('✅ LINE ID Collector läuft auf Port', PORT);
  console.log('🌐 URL: https://' + (process.env.PROJECT_DOMAIN || 'localhost') + '.glitch.me');
  console.log('📱 LINE Webhook: https://' + (process.env.PROJECT_DOMAIN || 'localhost') + '.glitch.me/line-webhook');
  console.log('🔗 GAS URL:', GAS_URL);
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
