#!/bin/bash
cd "$(dirname "$0")"
clear
echo "========== Attendance Tracker + Cloudflare =========="
echo "Starting local server and public tunnel..."

if ! lsof -ti:3000 >/dev/null 2>&1; then
  node server.js --no-open > /tmp/attendance_node.log 2>&1 &
  sleep 2
fi

pkill -f "cloudflared tunnel" 2>/dev/null
nohup cloudflared tunnel --url https://localhost:3000 --protocol http2 --no-autoupdate --no-tls-verify > /tmp/attendance_tunnel.log 2>&1 &

echo "Waiting for Cloudflare URL..."
URL=""
for i in $(seq 1 40); do
  URL=$(grep -o "https://[a-z0-9-]*\.trycloudflare\.com" /tmp/attendance_tunnel.log | head -1)
  [ -n "$URL" ] && break
  sleep 1
done

if [ -n "$URL" ]; then
  echo "$URL" > public-url.txt
  echo ""
  echo "  PUBLIC LINK (share this, works on any network):"
  echo "  $URL"
  echo ""
  echo "  LOCAL LINK : https://localhost:3000"
  echo "  PDFs save  : reports/  (on this laptop)"
  echo ""
  open "$URL" 2>/dev/null
else
  echo "Tunnel did not start - check /tmp/attendance_tunnel.log"
  open "https://localhost:3000" 2>/dev/null
fi

echo ""
echo "Press Enter to stop everything, or close this window."
read -r
pkill -f "cloudflared tunnel" 2>/dev/null
kill $(lsof -ti:3000) 2>/dev/null
echo "Stopped."