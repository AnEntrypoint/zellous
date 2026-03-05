#!/bin/bash
while true; do
  if ! ss -tlnp | grep -q ':3000 '; then
    cd /config/workspace/zellous
    PORT=3000 node server.js >> /tmp/zellous.log 2>&1 &
    echo "[$(date -u)] started zellous pid=$!" >> /tmp/zellous-keepalive.log
  fi
  sleep 5
done
