#!/usr/bin/env bash
# Hardens the VPS host firewall. Idempotent — safe to re-run (e.g. after reboot
# or Docker upgrade). Run ON the VPS as root:
#   bash /opt/grig-teo-space/deploy/harden-firewall.sh
#
# Two layers, because Docker-published ports bypass host INPUT rules:
#   1. INPUT chain — protects host-level listeners (SSH, nginx, anything
#      binding the host network directly). Scoped to the public interface so
#      Docker bridge traffic (containers reaching the host) is unaffected.
#   2. DOCKER-USER chain — drops traffic arriving on the public interface
#      before it reaches any Docker-published port. All services on this box
#      are proxied through host nginx on 127.0.0.1, so nothing Docker-published
#      needs to be reachable from the internet. This is what closes exposures
#      like "a container bound 0.0.0.0:3000".
#      Exception: debate_realtime_service's WebRTC media ports (40200-40300,
#      TCP+UDP) must stay publicly reachable — proxied HTTPS alone can't carry
#      them.
#
# NOTE: ufw is deliberately NOT used — on Debian, iptables-persistent
# (needed to persist the DOCKER-USER rules) conflicts with and removes ufw.
# Plain iptables covers both layers with one persistence mechanism.
#
# To undo:
#   iptables -D INPUT -i <pub-iface> -j DROP
#   iptables -D INPUT -i <pub-iface> -p tcp -m multiport --dports 22,80,443 -j ACCEPT
#   iptables -D DOCKER-USER -i <pub-iface> -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
#   iptables -D DOCKER-USER -i <pub-iface> -p udp --dport 40200:40300 -j ACCEPT
#   iptables -D DOCKER-USER -i <pub-iface> -p tcp --dport 40200:40300 -j ACCEPT
#   iptables -D DOCKER-USER -i <pub-iface> -j DROP
#   netfilter-persistent save
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

# --- Layer 1: INPUT chain (host-level listeners) -------------------------------
# Rules are scoped to the public interface; loopback and Docker bridge traffic
# stay unaffected. SSH (22) is allowed before the drop — no lockout risk.
if ! iptables -C INPUT -i lo -j ACCEPT 2>/dev/null; then
  iptables -I INPUT 1 -i lo -j ACCEPT
  echo "==> Added INPUT loopback accept"
fi

if ! iptables -C INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null; then
  iptables -I INPUT 2 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  echo "==> Added INPUT established/related accept"
fi

if ! iptables -C INPUT -i "${PUB_IFACE}" -p tcp -m multiport --dports 22,80,443 -j ACCEPT 2>/dev/null; then
  iptables -I INPUT 3 -i "${PUB_IFACE}" -p tcp -m multiport --dports 22,80,443 -j ACCEPT
  echo "==> Added INPUT 22/80/443 accept on ${PUB_IFACE}"
fi

if ! iptables -C INPUT -i "${PUB_IFACE}" -j DROP 2>/dev/null; then
  iptables -I INPUT 4 -i "${PUB_IFACE}" -j DROP
  echo "==> Added INPUT external drop on ${PUB_IFACE}"
fi

# --- Layer 2: DOCKER-USER chain ------------------------------------------------
# Docker creates DOCKER-USER on daemon start and never flushes it; rules here
# are evaluated before any port publishing. Insert order matters: established,
# WebRTC media exception, then the drop. Each rule is added idempotently.
if ! iptables -C DOCKER-USER -i "${PUB_IFACE}" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null; then
  iptables -I DOCKER-USER 1 -i "${PUB_IFACE}" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  echo "==> Added DOCKER-USER established/related accept on ${PUB_IFACE}"
fi

# WebRTC media ports for debate_realtime_service (must stay publicly open).
if ! iptables -C DOCKER-USER -i "${PUB_IFACE}" -p udp --dport 40200:40300 -j ACCEPT 2>/dev/null; then
  iptables -I DOCKER-USER 2 -i "${PUB_IFACE}" -p udp --dport 40200:40300 -j ACCEPT
  echo "==> Added DOCKER-USER WebRTC UDP 40200-40300 accept on ${PUB_IFACE}"
fi

if ! iptables -C DOCKER-USER -i "${PUB_IFACE}" -p tcp --dport 40200:40300 -j ACCEPT 2>/dev/null; then
  iptables -I DOCKER-USER 3 -i "${PUB_IFACE}" -p tcp --dport 40200:40300 -j ACCEPT
  echo "==> Added DOCKER-USER WebRTC TCP 40200-40300 accept on ${PUB_IFACE}"
fi

if ! iptables -C DOCKER-USER -i "${PUB_IFACE}" -j DROP 2>/dev/null; then
  iptables -I DOCKER-USER 4 -i "${PUB_IFACE}" -j DROP
  echo "==> Added DOCKER-USER external drop on ${PUB_IFACE}"
fi

# --- Persistence across reboots ------------------------------------------------
if ! command -v netfilter-persistent >/dev/null 2>&1; then
  echo "==> Installing iptables-persistent..."
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq iptables-persistent
fi
netfilter-persistent save

echo "==> INPUT chain now:"
iptables -L INPUT -n -v --line-numbers | head -12

echo "==> DOCKER-USER chain now:"
iptables -L DOCKER-USER -n -v --line-numbers

echo "==> Listening sockets AFTER:"
ss -tlnp || true

echo "==> Done. Verify from outside that only 22/80/443 answer."
