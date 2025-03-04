server {
    listen 80;
    server_name app.tuberbrief.com;

    # Redirect all HTTP traffic to HTTPS
    return 301 https://$host$request_uri;
}

# HTTPS Server Block - Listens on port 443 and serves Next.js app
server {
    listen 443 ssl;
    server_name app.tuberbrief.com;

    # SSL configuration managed by Certbot
    ssl_certificate /etc/letsencrypt/live/app.tuberbrief.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.tuberbrief.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        # Proxy requests to the Next.js app running on port 3000
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # Optional headers for improved client handling
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Optional: Add error handling
    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }
}