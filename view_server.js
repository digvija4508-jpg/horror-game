const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = 8001;
const TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.glb': 'model/gltf-binary',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
};
http.createServer((req, res) => {
    let fp = req.url === '/' ? '/view_system.html' : req.url;
    fp = path.join(__dirname, fp);
    if (fs.existsSync(fp) && fs.lstatSync(fp).isFile()) {
        const ext = path.extname(fp);
        res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
        fs.createReadStream(fp).pipe(res);
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
}).listen(PORT, () => console.log(`View system at http://localhost:${PORT}`));
