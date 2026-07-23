#!/usr/bin/env bash
# Hardens the VPS host firewall. Idempotent — safe to re-run (e.g. after a
# Docker upgrade or reboot). Run ON the VPS as root:
#   bash /opt/grig-teo-space/deploy/harden-firewall.sh
#
# Two layers, because Docker-published ports bypass ufw INPUT rules:
#   1. ufw — protects host-level listeners (SSH, nginx, anything binding the
#      host network directly). DEFAULT_FORWARD_POLICY is forced to ACCEPT:
#      Docker manages its own FORWARD rules and ufw's default DROP would
#      break container egress.
#   2. DOCKER-USER chain — drops traffic arriving on the public interface
#      before it reaches any Docker-published port. All services on this box
#      are proxied through host nginx on 127.0.0.1, so nothing Docker-published
#      needs to be reachable from the internet. This is what closes exposures
#      like "a container bound 0.0.0.0:3000".
#      Exception: debate_realtime_service's WebRTC media ports (40200-40300,
#      TCP+UDP) must stay publicly reachable — proxied HTTPS alone can't carry
#      them.
#      Docker recreates the DOCKER-USER chain on every daemon start, so the
#      rules are (re)applied by a systemd oneshot unit bound to docker.service
#      (re-runs on boot and on every docker restart).
#
# NOTE: iptables-persistent is deliberately NOT used — on Debian it conflicts
# with ufw (installing one removes the other). DOCKER-USER persistence comes
# from the systemd unit instead.
#
# To undo:
#   ufw disable
#   systemctl disable --now docker-user-fw.service
#   iptables -D DOCKER-USER -i <pub-iface> -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
#   iptables -D DOCKER-USER -i <pub-iface> -p udp --dport 40200:40300 -j ACCEPT
#   iptables -D DOCKER-USER -i <pub-iface> -p tcp --dport 40200:40300 -j ACCEPT
#   iptables -D DOCKER-USER -i <pub-iface> -j DROP
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: must run as root" >&2
  exit 1
fi

PUB_IFACE="$(ip route show default | awk '/^default/ {print $5; exit}')"
if [ -z "${PUB_IFACE}" ]; then
  echo "ERROR: could not detect default-route interface" >&2
  exit 1
fi
echo "==> Public interface: ${PUB_IFACE}"

echo "==> Listening sockets BEFORE:"
ss -tlnp || true

# --- Layer 1: ufw -------------------------------------------------------------
if ! command -v ufw >/dev/null 2>&1; then
  echo "==> Installing ufw..."
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ufw
fi

# Docker manages FORWARD itself; ufw's default DROP policy would break
# container egress (see the known ufw/Docker interaction).
sed -i 's/^DEFAULT_FORWARD_POLICY=.*/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   # SSH — must come before enabling
ufw allow 80/tcp   # HTTP (ACME challenges + redirect to HTTPS)
ufw allow 443/tcp  # HTTPS
ufw --force enable
ufw status verbose

# --- Layer 2: DOCKER-USER via systemd oneshot ----------------------------------
cat > /usr/local/sbin/docker-user-fw <<'DOCKERFW'
#!/bin/bash
# Idempotently (re)install the DOCKER-USER drop for Docker-published ports.
# Invoked by docker-user-fw.service after docker.service starts/restarts,
# because Docker recreates the chain (empty) on every daemon start.
set -e
PUB_IFACE="$(ip route show default | awk '/^default/ {print $5; exit}')"
[ -n "${PUB_IFACE}" ] || exit 1

iptables -C DOCKER-USER -i "${PUB_IFACE}" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || \
  iptables -I DOCKER-USER 1 -i "${PUB_IFACE}" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# WebRTC media ports for debate_realtime_service (must stay publicly open).
iptables -C DOCKER-USER -i "${PUB_IFACE}" -p udp --dport 40200:40300 -j ACCEPT 2>/dev/null || \
  iptables -I DOCKER-USER 2 -i "${PUB_IFACE}" -p udp --dport 40200:40300 -j ACCEPT
iptables -C DOCKER-USER -i "${PUB_IFACE}" -p tcp --dport 40200:40300 -j ACCEPT 2>/dev/null || \
  iptables -I DOCKER-USER 3 -i "${PUB_IFACE}" -p tcp --dport 40200:40300 -j ACCEPT

iptables -C DOCKER-USER -i "${PUB_IFACE}" -j DROP 2>/dev/null || \
  iptables -I DOCKER-USER 4 -i "${PUB_IFACE}" -j DROP
DOCKERFW
chmod 755 /usr/local/sbin/docker-user-fw

cat > /etc/systemd/system/docker-user-fw.service <<'UNIT'
[Unit]
Description=DOCKER-USER firewall rules (drop external access to Docker-published ports)
After=docker.service
PartOf=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/docker-user-fw

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now docker-user-fw.service

echo "==> DOCKER-USER chain now:"
iptables -L DOCKER-USER -n -v --line-numbers

# --- Cleanup: legacy rules from the earlier iptables-persistent approach ------
# ufw now owns the INPUT layer; drop the hand-rolled INPUT rules if present.
iptables -D INPUT -i "${PUB_IFACE}" -j DROP 2>/dev/null || true
iptables -D INPUT -i "${PUB_IFACE}" -p tcp -m multiport --dports 22,80,443 -j ACCEPT 2>/dev/null || true
iptables -D INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || true
iptables -D INPUT -i lo -j ACCEPT 2>/dev/null || true

if command -v netfilter-persistent >/dev/null 2>&1; then
  echo "==> Removing iptables-persistent (conflicts with ufw)..."
  DEBIAN_FRONTEND=noninteractive apt-get remove -y -qq iptables-persistent netfilter-persistent || true
fi

echo "==> INPUT chain now:"
iptables -L INPUT -n -v --line-numbers | head -15

echo "==> Listening sockets AFTER:"
ss -tlnp || true

echo "==> Done. Verify from outside that only 22/80/443 answer."
