import { createServer } from 'http';
import { join } from 'path';
import { readFileSync, existsSync, statSync, createReadStream } from 'fs';
import { parse } from 'url';

export function createLocalServer(port: number = 3001): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const parsedUrl = parse(req.url || '/', true);
      let pathname = parsedUrl.pathname || '/';
      
      // Map root to index.html
      if (pathname === '/') {
        pathname = '/index.html';
      }
      
      // Determine the base path for static files
      let basePath;
      if (process.resourcesPath) {
        // Packaged app - files are inside app.asar, need to use asar protocol or extract
        // In packaged Electron apps, we need to access files differently
        console.log('🔍 Packaged app detected');
        console.log('process.resourcesPath:', process.resourcesPath);
        console.log('__dirname:', __dirname);
        console.log('process.cwd():', process.cwd());
        
        // Try to find the out directory in various locations
        const possiblePaths = [
          join(process.resourcesPath, 'app.asar.unpacked', 'out'), // asarUnpack location
          join(__dirname, '..', '..', 'out'), // Relative to compiled js
          join(__dirname, '..', 'out'),
          join(process.cwd(), 'out'),
          join(process.resourcesPath, 'app', 'out')
        ];
        
        for (const path of possiblePaths) {
          console.log(`Checking path: ${path}`);
          if (existsSync(path)) {
            basePath = path;
            console.log(`✅ Found static files at: ${basePath}`);
            break;
          }
        }
        
        if (!basePath) {
          console.error('❌ Could not find static files directory in packaged app');
          // As fallback, try to use the path relative to the compiled js location
          basePath = join(__dirname, '..', '..', 'out');
        }
      } else {
        // Development
        basePath = join(process.cwd(), 'out');
        console.log('🔧 Development mode - static files at:', basePath);
      }
      
      const filePath = join(basePath, pathname);
      console.log(`📄 Requested: ${pathname} -> ${filePath}`);
      
      // Check if file exists
      if (!existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        res.statusCode = 404;
        res.end(`File not found: ${pathname}`);
        return;
      }
      
      // Get file stats to check if it's a directory
      const stats = statSync(filePath);
      if (stats.isDirectory()) {
        res.statusCode = 404;
        res.end('Directory listing not allowed');
        return;
      }
      
      // Set content type based on file extension
      const ext = filePath.split('.').pop()?.toLowerCase();
      const mimeTypes: { [key: string]: string } = {
        'html': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript',
        'json': 'application/json',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'svg': 'image/svg+xml',
        'ico': 'image/x-icon'
      };
      
      const contentType = mimeTypes[ext || ''] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      
      // Enable CORS and disable caching for development
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');
      
      // Stream the file
      const stream = createReadStream(filePath);
      stream.pipe(res);
      
      stream.on('error', (error) => {
        console.error('Stream error:', error);
        res.statusCode = 500;
        res.end('Internal Server Error');
      });
    });
    
    server.listen(port, 'localhost', () => {
      console.log(`Local server started on http://localhost:${port}`);
      resolve(`http://localhost:${port}`);
    });
    
    server.on('error', (error) => {
      console.error('Server error:', error);
      reject(error);
    });
  });
}