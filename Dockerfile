# Use Debian 12 image as the base
FROM debian:12

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install required packages
RUN apt-get update && apt-get install -y \
    curl \
    gdb \
    git \
    build-essential \
    devscripts \
    pkg-config \
    libgstreamer1.0-dev \
    libgstreamer-plugins-base1.0-dev \
    libgstreamer-plugins-bad1.0-dev \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-ugly \
    gstreamer1.0-libav \
    gstreamer1.0-tools \
    gstreamer1.0-x \
    gstreamer1.0-alsa \
    gstreamer1.0-gl \
    gstreamer1.0-gtk3 \
    gstreamer1.0-qt5 \
    gstreamer1.0-pulseaudio \
    libges-1.0-dev \
    libgstrtspserver-1.0-dev \
    libssl-dev \
    nodejs \
    npm \
    wireless-tools \
    && rm -rf /var/lib/apt/lists/*

# Install Rust 1.76
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- --default-toolchain 1.76.0 -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Clone the required repository
RUN git clone https://gitlab.freedesktop.org/gstreamer/gst-plugins-rs.git /gst-plugins-rs

# Set the working directory to the cloned repo
WORKDIR /gst-plugins-rs

# Install cargo-c
RUN cargo install cargo-c

# Create a directory to hold the copied plugins
RUN mkdir /generated-plugins

# Build gst-plugin-cdg
RUN cargo cbuild -p gst-plugin-cdg --prefix=/usr --libdir=/generated-plugins

# Install gst-plugin-cdg
RUN cargo cinstall -p gst-plugin-cdg --prefix=/usr --libdir=/generated-plugins
