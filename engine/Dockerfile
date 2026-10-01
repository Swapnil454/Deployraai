FROM golang:latest AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
RUN apt-get update && apt-get install -y clang llvm libbpf-dev gcc-multilib
RUN go install github.com/cilium/ebpf/cmd/bpf2go@latest
COPY . .
ARG BUILD_TAGS=""
RUN go generate ./...
RUN go build -tags "${BUILD_TAGS}" -o uptime-engine .

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=builder /app/uptime-engine .
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
CMD ["./uptime-engine"]
