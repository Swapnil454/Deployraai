#!/bin/bash
set -euo pipefail

MOCK_IP="198.20.0.1"

# Assign alias to lo
ip addr show dev lo | grep -q "$MOCK_IP" || ip addr add "$MOCK_IP/32" dev lo

HOSTS_TMP="/tmp/mock_hosts_proof"
rm -f "$HOSTS_TMP"
for mType in http api keyword ping port dns udp heartbeat; do
    for i in $(seq 0 9); do
        echo "$MOCK_IP mock-${mType}-${i}.mock.local" >> "$HOSTS_TMP"
    done
done
for i in $(seq 0 50000); do
    echo "$MOCK_IP mock-${i}.mock.local" >> "$HOSTS_TMP"
done
echo "$MOCK_IP mock.local" >> "$HOSTS_TMP"
echo "$MOCK_IP mock" >> "$HOSTS_TMP"

grep -v "\.mock\.local" /etc/hosts | grep -v " mock.local" | grep -v " mock$" > /tmp/hosts_clean || true
cat "$HOSTS_TMP" >> /tmp/hosts_clean
cp /tmp/hosts_clean /etc/hosts
chmod 666 /etc/hosts
echo "Populated /etc/hosts with $(wc -l < $HOSTS_TMP) mock hosts pointing to $MOCK_IP."
