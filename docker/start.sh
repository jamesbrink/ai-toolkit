#!/bin/bash
set -e  # Exit the script if any statement returns a non-true return value

# ref https://github.com/runpod/containers/blob/main/container-template/start.sh

# ---------------------------------------------------------------------------- #
#                          Function Definitions                                #
# ---------------------------------------------------------------------------- #

# Setup ssh
setup_ssh() {
    if [[ $PUBLIC_KEY ]]; then
        echo "Setting up SSH..."
        mkdir -p ~/.ssh
        echo "$PUBLIC_KEY" >> ~/.ssh/authorized_keys
        chmod 700 -R ~/.ssh

         if [ ! -f /etc/ssh/ssh_host_rsa_key ]; then
            ssh-keygen -t rsa -f /etc/ssh/ssh_host_rsa_key -q -N ''
            echo "RSA key fingerprint:"
            ssh-keygen -lf /etc/ssh/ssh_host_rsa_key.pub
        fi

        if [ ! -f /etc/ssh/ssh_host_dsa_key ]; then
            ssh-keygen -t dsa -f /etc/ssh/ssh_host_dsa_key -q -N ''
            echo "DSA key fingerprint:"
            ssh-keygen -lf /etc/ssh/ssh_host_dsa_key.pub
        fi

        if [ ! -f /etc/ssh/ssh_host_ecdsa_key ]; then
            ssh-keygen -t ecdsa -f /etc/ssh/ssh_host_ecdsa_key -q -N ''
            echo "ECDSA key fingerprint:"
            ssh-keygen -lf /etc/ssh/ssh_host_ecdsa_key.pub
        fi

        if [ ! -f /etc/ssh/ssh_host_ed25519_key ]; then
            ssh-keygen -t ed25519 -f /etc/ssh/ssh_host_ed25519_key -q -N ''
            echo "ED25519 key fingerprint:"
            ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
        fi

        service ssh start

        echo "SSH host keys:"
        for key in /etc/ssh/*.pub; do
            echo "Key: $key"
            ssh-keygen -lf $key
        done
    fi
}

# Export env vars
export_env_vars() {
    echo "Exporting environment variables..."
    printenv | grep -E '^RUNPOD_|^AI_TOOLKIT_|^HF_|^ANTHROPIC_|^CLAUDE_|^PATH=' | awk -F = '{ print "export " $1 "=\"" $2 "\"" }' >> /etc/rp_environment
    echo 'source /etc/rp_environment' >> ~/.bashrc
}

# ---------------------------------------------------------------------------- #
#                               Main Program                                   #
# ---------------------------------------------------------------------------- #

echo "Pod Started"

setup_ssh
export_env_vars

# --- Writable data directories ---
export DATASETS_FOLDER="${DATASETS_FOLDER:-/app/ai-toolkit/datasets}"
export TRAINING_FOLDER="${TRAINING_FOLDER:-/app/ai-toolkit/output}"
export DATA_ROOT="${DATA_ROOT:-/app/ai-toolkit/data}"
mkdir -p "$DATASETS_FOLDER" "$TRAINING_FOLDER" "$DATA_ROOT"

# --- Database ---
export DATABASE_URL="${DATABASE_URL:-file:/app/ai-toolkit/aitk_db.db}"

# --- Port ---
export PORT="${PORT:-8675}"

echo ""
echo "AI Toolkit UI starting..."
echo "  Port:         $PORT"
echo "  Datasets:     $DATASETS_FOLDER"
echo "  Output:       $TRAINING_FOLDER"
echo "  Database:     $DATABASE_URL"
echo ""

# --- Ensure DB schema is up to date ---
# Prisma 7 removed --skip-generate; pass --url directly to avoid needing
# tsx to load prisma.config.ts at this stage.
echo "Running prisma db push to ensure schema is up to date..."
cd /app/ai-toolkit/ui
if ! npx prisma db push --url "$DATABASE_URL" 2>&1; then
    echo "Warning: prisma db push failed, DB may need manual setup"
fi

# --- Start UI (worker + Next.js server via concurrently) ---
echo "Starting AI Toolkit UI..."
exec npm run start
