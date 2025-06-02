function sendLineIdToGAS(userId) {
  return new Promise((resolve, reject) => {
    // 関数内で環境変数を取得
    const gasUrl = process.env.GAS_URL || 'https://script.google.com/macros/s/AKfycbzIZbg87UoPo8X9FGvaYmht0GNupn_ShOrdx7KaO6vWWxaj1Qrr11D2zPPQuJOp1RNp/exec';
  
    console.log('🔍 使用するGAS URL:', gasUrl);
    
    const postData = JSON.stringify({
      action: 'updateLineId',
      userId: userId,
      timestamp: new Date().toISOString()
    });
    
    console.log('🔍 GASに送信するデータ詳細:');
    console.log('📊 JSON文字列:', postData);
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    // URL parsen für HTTPS Request
    const parsedGasUrl = new URL(gasUrl);
    options.hostname = parsedGasUrl.hostname;
    options.path = parsedGasUrl.pathname + parsedGasUrl.search;
    options.port = 443;

    console.log('🔍 リクエストオプション:', JSON.stringify(options, null, 2));

    const req = https.request(options, (res) => {
      let responseData = '';
      
      console.log('📥 GASレスポンスヘッダー:', res.headers);
      console.log('📥 GASレスポンスステータス:', res.statusCode);
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        console.log('📥 GAS完全レスポンス:', responseData);
        resolve({
          status: res.statusCode,
          data: responseData,
          headers: res.headers
        });
      });
    });

    req.on('error', (error) => {
      console.error('❌ GAS Request Fehler:', error);
      reject(error);
    });

    console.log('📤 POSTデータ送信中...');
    req.write(postData);
    req.end();
    console.log('📤 リクエスト完了');
  });
}
