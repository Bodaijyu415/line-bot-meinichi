const http = require('http');
const https = require('https');
const url = require('url');

// Google Apps Script URL
const GAS_URL = process.env.GAS_URL || 'https://script.google.com/macros/s/AKfycbzIZbg87UoPo8X9FGvaYmht0GNupn_ShOrdx7KaO6vWWxaj1Qrr11D2zPPQuJOp1RNp/exec';

// シンプルなGAS送信関数
function sendToGAS(userId) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      action: 'updateLineId',
      userId: userId,
      timestamp: new Date().toISOString()
    });
    
    console.log('📤 GASに送信:', userId);
    
    const gasUrl = new URL(GAS_URL);
    const options = {
      hostname: gasUrl.hostname,
      path: gasUrl.pathname + gasUrl.search,
      port: 443,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log('✅ GAS応答:', data);
        resolve(data);
      });
    });

    req.on('error', (error) => {
      console.error('❌ GASエラー:', error);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// HTTPサーバー
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    // ホームページ
    if (parsedUrl.pathname === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'LINE Bot Running',
        message: 'Simple LINE ID Collector',
        timestamp: new Date().toISOString()
      }));
      return;
    }

    // LINE Webhook
    if (parsedUrl.pathname === '/line-webhook' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          console.log('📱 LINE Webhook受信');
          const data = JSON.parse(body);
          
          if (data.events && data.events.length > 0) {
            for (const event of data.events) {
              if (event.source && event.source.userId) {
                console.log('👤 ユーザーID:', event.source.userId);
                
                try {
                  await sendToGAS(event.source.userId);
                  console.log('✅ GAS送信成功');
                } catch (error) {
                  console.error('❌ GAS送信失敗:', error);
                }
              }
            }
          }
          
          res.writeHead(200);
          res.end('OK');
        } catch (error) {
          console.error('❌ Webhook処理エラー:', error);
          res.writeHead(500);
          res.end('Error');
        }
      });
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));

  } catch (error) {
    console.error('❌ サーバーエラー:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('✅ Server running on port', PORT);
  console.log('🔗 GAS URL:', GAS_URL);
});

// Graceful shutdown
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
