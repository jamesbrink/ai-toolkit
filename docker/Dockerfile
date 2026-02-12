FROM nvidia/cuda:12.8.1-devel-ubuntu24.04

LABEL authors="jaret"

# Set noninteractive to avoid timezone prompts
ENV DEBIAN_FRONTEND=noninteractive

# ref https://en.wikipedia.org/wiki/CUDA
ENV TORCH_CUDA_ARCH_LIST="8.0 8.6 8.9 9.0 10.0 12.0"

# Install dependencies
RUN apt-get update && apt-get install --no-install-recommends -y \
    git \
    curl \
    build-essential \
    cmake \
    wget \
    python3.12 \
    python3-pip \
    python3-dev \
    python3-setuptools \
    python3-wheel \
    python3-venv \
    ffmpeg \
    tmux \
    htop \
    nvtop \
    python3-opencv \
    openssh-client \
    openssh-server \
    openssl \
    rsync \
    unzip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22 LTS
WORKDIR /tmp
RUN curl -sL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh && \
    bash nodesource_setup.sh && \
    apt-get update && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set aliases for python and pip
RUN ln -s /usr/bin/python3 /usr/bin/python

# Install pytorch before copying source to leverage docker cache
RUN pip install --no-cache-dir torch==2.9.1 torchvision==0.24.1 torchaudio==2.9.1 --index-url https://download.pytorch.org/whl/cu128 --break-system-packages

# Copy requirements.txt first to leverage docker cache for pip install
COPY requirements.txt /app/ai-toolkit/requirements.txt

WORKDIR /app/ai-toolkit

# Install Python dependencies
RUN pip install --no-cache-dir --break-system-packages -r requirements.txt && \
    pip install setuptools==69.5.1 --no-cache-dir --break-system-packages

# Copy UI package files first for npm cache layer
COPY ui/package.json ui/package-lock.json /app/ai-toolkit/ui/

# Install npm dependencies (cached unless package files change)
WORKDIR /app/ai-toolkit/ui
RUN npm ci

# Copy the rest of the source
WORKDIR /app/ai-toolkit
COPY . /app/ai-toolkit/

# Generate Prisma client (must happen before Next.js build, which imports it).
# DATABASE_URL is required by prisma.config.ts but not used during generate.
WORKDIR /app/ai-toolkit/ui
RUN DATABASE_URL="file:./dev.db" npx prisma generate

# Build UI and initialize database
RUN npm run build && \
    npm run update_db

EXPOSE 8675

WORKDIR /

COPY docker/start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]
