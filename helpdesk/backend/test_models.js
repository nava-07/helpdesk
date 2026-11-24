const fs = require('fs');
const https = require('https');
const key = "AIzaSyDWOTVXntPjCt4bKxgH49c7l9eAjdiFMDM";
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.models) {
        fs.writeFileSync('out_utf8.txt', json.models.map(m => m.name).join('\n'), 'utf8');
      } else {
        fs.writeFileSync('out_utf8.txt', JSON.stringify(data), 'utf8');
      }
    } catch(e) {
      console.log('Parse error');
    }
  });
}).on('error', err => console.error(err));
