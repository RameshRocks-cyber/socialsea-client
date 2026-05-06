# Frontend Deployment (socialsea.co.in)

## 1) Build
```bash
cd /home/ubuntu/socialsea-client-main/socialsea-client-main
cp .env.production.example .env.production
npm ci
npm run build
```

## 2) Host with Nginx
Copy `dist/` to web root (example):
```bash
sudo mkdir -p /var/www/socialsea
sudo rsync -av --delete dist/ /var/www/socialsea/
```

## 3) Nginx config for SPA + API proxy
Create `/etc/nginx/sites-available/socialsea-frontend`:
```nginx
server {
    server_name socialsea.co.in www.socialsea.co.in;

    root /var/www/socialsea;
    index index.html;
    client_max_body_size 2G;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Frontend -> backend API
    location /api/ {
        proxy_pass https://api.socialsea.co.in/;
        proxy_http_version 1.1;
        proxy_set_header Host api.socialsea.co.in;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend -> backend websocket
    location /ws {
        proxy_pass https://api.socialsea.co.in/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host api.socialsea.co.in;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and reload:
```bash
sudo ln -s /etc/nginx/sites-available/socialsea-frontend /etc/nginx/sites-enabled/socialsea-frontend
sudo nginx -t
sudo systemctl reload nginx
```

## 4) SSL certificates
```bash
sudo certbot --nginx -d socialsea.co.in -d www.socialsea.co.in
```

## 5) Verify
- Open: `https://socialsea.co.in`
- Check API from browser console:
```js
fetch('/api/actuator/health').then(r => r.json()).then(console.log)
```
