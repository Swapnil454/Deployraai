package core

import (
	"encoding/binary"
	"hash/fnv"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
)

var secretEnvVar = os.Getenv("UPTIME_EBPF_SECRET")
var outboundIP net.IP

func init() {
	conn, err := net.Dial("udp", "8.8.8.8:53")
	if err == nil {
		outboundIP = conn.LocalAddr().(*net.UDPAddr).IP.To4()
		conn.Close()
	} else {
		outboundIP = net.ParseIP("127.0.0.1").To4()
	}
}

func CalculateHash(targetIP string, monitorID string, nonce uint64) uint32 {
	h := fnv.New32a()
	h.Write([]byte(secretEnvVar))
	h.Write([]byte(targetIP))
	h.Write([]byte(monitorID))
	var b [8]byte
	binary.LittleEndian.PutUint64(b[:], nonce)
	h.Write(b[:])
	return h.Sum32()
}

func GetTargetPort(urlStr string) uint16 {
	host := urlStr
	if strings.Contains(host, "://") {
		if u, err := url.Parse(urlStr); err == nil {
			host = u.Host
		}
	}
	if strings.Contains(host, ":") {
		_, portStr, err := net.SplitHostPort(host)
		if err == nil {
			if p, err := strconv.Atoi(portStr); err == nil {
				return uint16(p)
			}
		}
	}
	return 80 // Default to 80
}
