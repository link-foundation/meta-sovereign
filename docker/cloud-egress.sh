#!/bin/sh
set -eu
rm -f /run/egress-ready

# The web container shares this network namespace without NET_ADMIN.
# Install the entire policy atomically before the readiness marker appears.
iptables-restore <<'RULES'
*filter
:INPUT ACCEPT [0:0]
:FORWARD DROP [0:0]
:OUTPUT DROP [0:0]
-A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A OUTPUT -d 127.0.0.11/32 -p udp -m conntrack --ctdir ORIGINAL --ctorigdstport 53 -j ACCEPT
-A OUTPUT -d 127.0.0.11/32 -p tcp -m conntrack --ctdir ORIGINAL --ctorigdstport 53 -j ACCEPT
-A OUTPUT -m addrtype --dst-type LOCAL -j REJECT
-A OUTPUT -d 0.0.0.0/8 -j REJECT
-A OUTPUT -d 10.0.0.0/8 -j REJECT
-A OUTPUT -d 100.64.0.0/10 -j REJECT
-A OUTPUT -d 127.0.0.0/8 -j REJECT
-A OUTPUT -d 169.254.0.0/16 -j REJECT
-A OUTPUT -d 172.16.0.0/12 -j REJECT
-A OUTPUT -d 192.0.0.0/24 -j REJECT
-A OUTPUT -d 192.0.2.0/24 -j REJECT
-A OUTPUT -d 192.88.99.0/24 -j REJECT
-A OUTPUT -d 192.168.0.0/16 -j REJECT
-A OUTPUT -d 198.18.0.0/15 -j REJECT
-A OUTPUT -d 198.51.100.0/24 -j REJECT
-A OUTPUT -d 203.0.113.0/24 -j REJECT
-A OUTPUT -d 224.0.0.0/3 -j REJECT
-A OUTPUT -m conntrack --ctstate NEW -j ACCEPT
COMMIT
RULES
touch /run/egress-ready
exec sleep infinity
