# Keep the base image if you prefer, or switch to rustlang/rust:nightly
FROM rust:1.86-slim

SHELL ["bash", "-c"]

# Install system dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
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
RUN cargo install --locked linera-service@0.15.6 linera-storage-service@0.15.6

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