FROM golang:latest AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
RUN apt-get update && apt-get install -y --no-install-recommends clang llvm libbpf-dev gcc-multilib && rm -rf /var/lib/apt/lists/*
RUN go install github.com/cilium/ebpf/cmd/bpf2go@latest
COPY . .
ARG BUILD_TAGS=""
RUN go generate ./...
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -tags "${BUILD_TAGS}" -o uptime-engine .

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* \
    && groupadd -r engine && useradd -r -g engine engine
WORKDIR /app
COPY --from=builder /app/uptime-engine .
RUN chown -R engine:engine /app
USER engine
CMD ["./uptime-engine"]
