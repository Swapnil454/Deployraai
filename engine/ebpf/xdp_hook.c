// +build ignore

#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/in.h>
#include <linux/tcp.h>
#include <linux/icmp.h>
#include <bpf/bpf_helpers.h>

struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 1 << 20); 
} ping_events SEC(".maps");

struct ping_event_t {
    __u16 monitor_index;
    __u32 echoed_hash;
    __u64 ktime_ns;
} __attribute__((packed));

// Force emit of the struct to the Go generated code
struct ping_event_t *unused_event __attribute__((unused));

SEC("xdp")
int xdp_ping_interceptor(struct xdp_md *ctx) {
    void *data_end = (void *)(long)ctx->data_end;
    void *data = (void *)(long)ctx->data;

    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end || eth->h_proto != __constant_htons(ETH_P_IP)) return XDP_PASS;
    
    struct iphdr *ip = (struct iphdr *)(eth + 1);
    if ((void *)(ip + 1) > data_end) return XDP_PASS;

    // TCP BRANCH (32-bit Entropy)
    if (ip->protocol == IPPROTO_TCP) {
        struct tcphdr *tcp = (struct tcphdr *)((__u32 *)ip + ip->ihl * 4);
        if ((void *)(tcp + 1) > data_end) return XDP_PASS;
        
        __u16 dest_port = __builtin_bswap16(tcp->dest);
        // Valid port range 10000 to 65000
        if (dest_port < 10000 || dest_port > 65000) return XDP_PASS;
        
        // We only care about SYN-ACKs
        if (tcp->syn && tcp->ack) {
            __u32 original_ack = tcp->ack_seq;
            
            struct ping_event_t *event = bpf_ringbuf_reserve(&ping_events, sizeof(*event), 0);
            if (event) {
                event->monitor_index = dest_port; 
                event->echoed_hash = __builtin_bswap32(original_ack) - 1;
                event->ktime_ns = bpf_ktime_get_ns();
                bpf_ringbuf_submit(event, 0);
            }
            
            // --- XDP_TX ZERO-COST TEARDOWN ---
            
            // 1. Trim packet to exactly 54 bytes (Ethernet 14 + IPv4 20 + TCP 20)
            int pkt_len = (void *)data_end - (void *)data;
            int target_len = sizeof(struct ethhdr) + sizeof(struct iphdr) + sizeof(struct tcphdr);
            if (pkt_len > target_len) {
                bpf_xdp_adjust_tail(ctx, target_len - pkt_len); // Decrease size
                data_end = (void *)(long)ctx->data_end;
                data = (void *)(long)ctx->data;
                eth = data;
                if ((void *)(eth + 1) > data_end) return XDP_DROP;
                ip = (struct iphdr *)(eth + 1);
                if ((void *)(ip + 1) > data_end) return XDP_DROP;
                tcp = (struct tcphdr *)((__u32 *)ip + ip->ihl * 4);
                if ((void *)(tcp + 1) > data_end) return XDP_DROP;
            }

            // 2. Swap MACs
            __u8 tmp_mac[ETH_ALEN];
            __builtin_memcpy(tmp_mac, eth->h_dest, ETH_ALEN);
            __builtin_memcpy(eth->h_dest, eth->h_source, ETH_ALEN);
            __builtin_memcpy(eth->h_source, tmp_mac, ETH_ALEN);

            // 3. Swap IPs
            __u32 tmp_ip = ip->saddr;
            ip->saddr = ip->daddr;
            ip->daddr = tmp_ip;

            // 4. Swap Ports
            __u16 tmp_port = tcp->source;
            tcp->source = tcp->dest;
            tcp->dest = tmp_port;

            // 5. Update TCP state for RST
            tcp->seq = original_ack;
            tcp->ack_seq = 0;
            
            // Clear flags, set RST
            tcp->syn = 0;
            tcp->ack = 0;
            tcp->rst = 1;
            
            ip->tot_len = __constant_htons(40); // 20 IP + 20 TCP
            tcp->doff = 5; // 20 bytes

            // 6. Recalculate IP Checksum
            ip->check = 0;
            __u32 ip_csum = 0;
            __u16 *ip_ptr = (__u16 *)ip;
            #pragma unroll
            for (int i = 0; i < 10; i++) {
                ip_csum += ip_ptr[i];
            }
            ip_csum = (ip_csum & 0xffff) + (ip_csum >> 16);
            ip_csum = (ip_csum & 0xffff) + (ip_csum >> 16);
            ip->check = ~((__u16)ip_csum);

            // 7. Recalculate TCP Checksum
            tcp->check = 0;
            __u32 tcp_csum = 0;
            tcp_csum += (ip->saddr >> 16) & 0xFFFF;
            tcp_csum += (ip->saddr) & 0xFFFF;
            tcp_csum += (ip->daddr >> 16) & 0xFFFF;
            tcp_csum += (ip->daddr) & 0xFFFF;
            tcp_csum += __constant_htons(IPPROTO_TCP);
            tcp_csum += __constant_htons(20);
            
            __u16 *tcp_ptr = (__u16 *)tcp;
            #pragma unroll
            for (int i = 0; i < 10; i++) {
                tcp_csum += tcp_ptr[i];
            }
            tcp_csum = (tcp_csum & 0xffff) + (tcp_csum >> 16);
            tcp_csum = (tcp_csum & 0xffff) + (tcp_csum >> 16);
            tcp->check = ~((__u16)tcp_csum);

            return XDP_TX;
        }
    } 
    // ICMP BRANCH (16-bit Entropy Trade-off)
    else if (ip->protocol == IPPROTO_ICMP) {
        struct icmphdr *icmp = (struct icmphdr *)((__u32 *)ip + ip->ihl * 4);
        if ((void *)(icmp + 1) > data_end) return XDP_PASS;
        
        if (icmp->type == ICMP_ECHOREPLY) {
            struct ping_event_t *event = bpf_ringbuf_reserve(&ping_events, sizeof(*event), 0);
            if (event) {
                event->monitor_index = __builtin_bswap16(icmp->un.echo.id);
                event->echoed_hash = __builtin_bswap16(icmp->un.echo.sequence);
                event->ktime_ns = bpf_ktime_get_ns();
                bpf_ringbuf_submit(event, 0);
            }
            return XDP_DROP;
        }
    }

    return XDP_PASS;
}

char __license[] SEC("license") = "Dual MIT/GPL";
