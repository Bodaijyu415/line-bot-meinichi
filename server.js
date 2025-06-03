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
        'Content-Type': 'application/json'
      }
    };

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
