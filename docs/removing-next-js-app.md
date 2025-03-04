# Steps to Remove a Next.js App Deployed with PM2 on Ubuntu

## List running PM2 apps

pm2 list

## Stop the app

pm2 stop <app_name_or_id>

## Delete the app from PM2

pm2 delete <app_name_or_id>

## Verify it’s removed from PM2

pm2 list

## List all Certbot certificates to find the one tied to your-app

sudo certbot certificates

## Look for the certificate associated with your domain (e.g., flow-fusion.example.com). The output will show something like:

Certificate Name: flow-fusion.example.com
Domains: flow-fusion.example.com
Expiry Date: 2025-06-01
Certificate Path: /etc/letsencrypt/live/flow-fusion.example.com/fullchain.pem

## Delete the certificate

sudo certbot delete --cert-name <certificate_name>

## Navigate to the parent directory

cd /var/www

## Delete the app directory and its contents

sudo rm -rf /var/www/your-app

## Delete the Nginx configuration file

sudo rm /etc/nginx/sites-available/your-app
sudo rm /etc/nginx/sites-enabled/your-app

## Test and reload Nginx

sudo nginx -t
sudo systemctl reload nginx
