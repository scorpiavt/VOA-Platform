#!/usr/bin/env bash
# Run on VPS as root after uploading voa-platform
set -euo pipefail

APP_ROOT=/home/skymp/voa-platform
API_DIR=$APP_ROOT/services/api

mkdir -p /var/www/voa-cdn/client /var/www/voa-cdn/launcher
chown -R skymp:skymp /var/www/voa-cdn

if [ ! -d "$APP_ROOT" ]; then
  echo "Upload voa-platform to $APP_ROOT first"
  exit 1
fi

cd "$APP_ROOT"
npm install
npm run build:api

if [ ! -f "$API_DIR/.env" ]; then
  cp "$API_DIR/.env.example" "$API_DIR/.env"
  echo "Edit $API_DIR/.env with secrets before starting"
fi

chown -R skymp:skymp "$APP_ROOT"

cp "$APP_ROOT/deploy/systemd/voa-api.service" /etc/systemd/system/voa-api.service
systemctl daemon-reload
systemctl enable voa-api
# systemctl start voa-api  # after .env is filled

# optional nginx
if command -v nginx >/dev/null; then
  cp "$APP_ROOT/deploy/nginx/voa.conf" /etc/nginx/sites-available/voa
  ln -sf /etc/nginx/sites-available/voa /etc/nginx/sites-enabled/voa
  nginx -t && systemctl reload nginx
fi

echo "Open firewall for 3100/tcp (or 80 via nginx)"
echo "Done. Fill Discord secrets in .env then: systemctl start voa-api"
