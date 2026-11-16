with open("/tmp/hosts_mock", "w") as f:
    for i in range(50000):
        f.write(f"198.20.0.1 mock-{i}.mock.local\n")
print("Generated 50000 mock host entries in /tmp/hosts_mock")
