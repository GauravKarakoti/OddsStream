# Keep the base image if you prefer, or switch to rustlang/rust:nightly
FROM rust:1.86-slim

SHELL ["bash", "-c"]

RUN apt-get update && apt-get install -y \
    build-essential \
    pkg-config \
    libssl-dev \
    protobuf-compiler \
    clang \
    make \
    curl \
    git

# --- ADD THIS SECTION ---
# Install and switch to Nightly Rust
RUN rustup toolchain install nightly && \
    rustup default nightly && \
    rustup target add wasm32-unknown-unknown --toolchain nightly
# ------------------------

# Install Linera binaries (now using Nightly)
RUN git clone --branch testnet_conway https://github.com/linera-io/linera-protocol /tmp/linera-protocol && \
    cd /tmp/linera-protocol && \
    RUSTUP_TOOLCHAIN=nightly cargo install --path linera-service --locked --jobs 1 && \
    RUSTUP_TOOLCHAIN=nightly cargo install --path linera-storage-service --locked --jobs 1 && \
    cd / && \
    rm -rf /tmp/linera-protocol

# Install Node.js and pnpm/npm
RUN curl https://raw.githubusercontent.com/creationix/nvm/v0.40.3/install.sh | \
    bash \
    && . ~/.nvm/nvm.sh \
    && nvm install lts/krypton \
    && npm install -g pnpm

WORKDIR /build

# Check port 3000 (React default)
HEALTHCHECK CMD ["curl", "-s", "http://localhost:3000"]

ENTRYPOINT bash /build/run.bash