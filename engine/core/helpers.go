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
		ifaces, _ := net.Interfaces()
		for _, i := range ifaces {
			addrs, _ := i.Addrs()
			for _, addr := range addrs {
				var ip net.IP
				switch v := addr.(type) {
				case *net.IPNet:
					ip = v.IP
				case *net.IPAddr:
					ip = v.IP
				}
				if ip != nil && !ip.IsLoopback() && ip.To4() != nil {
					outboundIP = ip.To4()
					return
				}
			}
		}
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

func ExtractHost(urlStr string) string {
	host := urlStr
	if strings.Contains(host, "://") {
		if u, err := url.Parse(urlStr); err == nil {
			host = u.Host
		}
	}
	return strings.ToLower(host)
}
