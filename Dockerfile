FROM php:8.3-alpine

# Install OpenSSH client for remote command execution and system tools
RUN apk add --no-cache \
    openssh-client \
    curl

# Configure PHP production settings
RUN mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

WORKDIR /var/www/html

# Copy application files
COPY web/ ./web/

# Expose RigPulse port
EXPOSE 8000

# Start PHP built-in web server pointing to web/
CMD ["php", "-S", "0.0.0.0:8000", "-t", "web/"]
