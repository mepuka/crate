# HTTPS Configuration for FAISS Search API

## Overview

The FAISS Search API is deployed on a Digital Ocean Droplet at `cratemusic.duckdns.org` with HTTPS enabled using Let's Encrypt SSL certificates.

## Current Setup

**Domain:** cratemusic.duckdns.org
**IP:** Managed via DuckDNS dynamic DNS
**SSL Certificate:** Let's Encrypt (90-day validity, auto-renewal)
**Certificate Expires:** 2026-02-15 (check with: `ssh root@cratemusic.duckdns.org "openssl x509 -in /root/faiss-search-api/certbot/conf/live/cratemusic.duckdns.org/fullchain.pem -noout -enddate"`)

## File Structure

```
/root/faiss-search-api/
├── nginx.conf                    # HTTPS configuration (active)
├── nginx-http-acme.conf         # HTTP-only config for cert generation
├── nginx-backup.conf            # Backup configuration
├── nginx-https-backup.conf      # Backup of HTTPS config
├── certbot/
│   ├── conf/                    # SSL certificates and renewal config
│   │   └── live/
│   │       └── cratemusic.duckdns.org/
│   │           ├── fullchain.pem
│   │           ├── privkey.pem
│   │           └── chain.pem
│   └── www/                     # ACME challenge files
│       └── .well-known/
│           └── acme-challenge/
└── docker-compose.yml           # Container configuration
```

## nginx Configuration Files

### nginx.conf (HTTPS - Active)
- Redirects HTTP (port 80) to HTTPS (port 443)
- Serves API via HTTPS with HTTP/2
- Includes security headers (HSTS, X-Frame-Options, etc.)
- Handles ACME challenges for certificate renewal
- **Mounted in nginx container:** `/etc/nginx/conf.d/default.conf`

### nginx-http-acme.conf (HTTP-only)
- Used temporarily during initial certificate generation
- Serves API via HTTP
- Handles ACME challenges
- **Only use when generating certificates for the first time**

## Docker Compose Configuration

```yaml
nginx:
  volumes:
    - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    - ./certbot/conf:/etc/letsencrypt:ro
    - ./certbot/www:/var/www/certbot:ro
  ports:
    - "80:80"
    - "443:443"

certbot:
  volumes:
    - ./certbot/conf:/etc/letsencrypt
    - ./certbot/www:/var/www/certbot
  entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"
```

## Certificate Management

### Initial Certificate Generation

**Prerequisites:**
1. DNS record pointing to Droplet IP
2. Port 80 accessible (for ACME challenge)
3. `.well-known/acme-challenge/` directory exists

**Steps:**

```bash
# 1. SSH into Droplet
ssh root@cratemusic.duckdns.org

# 2. Create ACME challenge directory
mkdir -p /root/faiss-search-api/certbot/www/.well-known/acme-challenge

# 3. Switch to HTTP-only config temporarily
cd /root/faiss-search-api
cp nginx.conf nginx-https-backup.conf
cp nginx-http-acme.conf nginx.conf
docker-compose restart nginx

# 4. Generate certificate
docker-compose run --rm --entrypoint certbot certbot \
  certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email pooks@pooksthompson.com \
  --agree-tos \
  --no-eff-email \
  -d cratemusic.duckdns.org

# 5. Restore HTTPS config
cp nginx-https-backup.conf nginx.conf
docker-compose restart nginx

# 6. Verify HTTPS works
curl -I https://cratemusic.duckdns.org/api/health
```

### Certificate Renewal

Let's Encrypt certificates are valid for 90 days. The certbot container automatically renews certificates every 12 hours when they're within 30 days of expiration.

**Manual Renewal (if needed):**

```bash
ssh root@cratemusic.duckdns.org

cd /root/faiss-search-api
docker-compose run --rm --entrypoint certbot certbot renew

# Reload nginx to pick up new certificates
docker-compose restart nginx
```

**Check Certificate Status:**

```bash
ssh root@cratemusic.duckdns.org "openssl x509 -in /root/faiss-search-api/certbot/conf/live/cratemusic.duckdns.org/fullchain.pem -noout -dates"
```

### Force Certificate Renewal (Testing)

```bash
ssh root@cratemusic.duckdns.org

cd /root/faiss-search-api
docker-compose run --rm --entrypoint certbot certbot \
  renew \
  --force-renewal

docker-compose restart nginx
```

## Deployment Process

### IMPORTANT: Nginx Config Protection

The deployment script (`scripts/deploy_to_droplet.sh`) **excludes nginx config files and certbot directory** from rsync to prevent overwriting the server's HTTPS configuration:

```bash
rsync -avz --progress \
    --exclude='nginx*.conf' \
    --exclude='certbot/' \
    # ... other excludes
```

**What this means:**
- Deploying code changes will NOT overwrite nginx.conf on the Droplet
- SSL certificates and configuration remain intact during deployments
- Local nginx.conf changes are NOT deployed (by design)

### Safe Deployment

```bash
# Deploy application code (preserves HTTPS config)
cd /Users/pooks/Dev/crate/faiss-search-api
./scripts/deploy_to_droplet.sh --app-only
```

### Manual nginx Config Updates

If you need to update nginx configuration on the Droplet:

```bash
# 1. Make changes directly on Droplet (NOT locally)
ssh root@cratemusic.duckdns.org

cd /root/faiss-search-api
nano nginx.conf  # Make your changes

# 2. Test nginx configuration
docker exec kexp-nginx nginx -t

# 3. If valid, restart nginx
docker-compose restart nginx

# 4. Verify
curl -I https://cratemusic.duckdns.org/api/health
```

## Troubleshooting

### HTTPS Not Working After Deployment

**Symptom:** API returns 502 Bad Gateway or certificate errors

**Solution:**
```bash
ssh root@cratemusic.duckdns.org

cd /root/faiss-search-api

# Check if nginx.conf is HTTPS version
head -1 nginx.conf  # Should say "SSL" in first line

# Check if certificates exist
ls -la certbot/conf/live/cratemusic.duckdns.org/

# Restart nginx
docker-compose restart nginx
```

### Certificate Validation Failed

**Symptom:** Certbot fails with "Failed to download challenge files"

**Cause:** ACME challenge path not accessible

**Solution:**
```bash
# Verify ACME directory exists
ssh root@cratemusic.duckdns.org "ls -la /root/faiss-search-api/certbot/www/.well-known/acme-challenge/"

# Test accessibility
ssh root@cratemusic.duckdns.org "echo 'test' > /root/faiss-search-api/certbot/www/.well-known/acme-challenge/test.txt"
curl http://cratemusic.duckdns.org/.well-known/acme-challenge/test.txt
```

### HTTP Still Serving (No HTTPS Redirect)

**Symptom:** API accessible via HTTP without redirect to HTTPS

**Cause:** nginx container using HTTP-only config

**Solution:**
```bash
ssh root@cratemusic.duckdns.org

cd /root/faiss-search-api

# Ensure HTTPS config is active
cp nginx-https-backup.conf nginx.conf  # Or manually verify nginx.conf has HTTPS block

# Restart nginx
docker-compose restart nginx
```

### Certificate Expired

**Symptom:** Browser shows "Certificate Expired" warning

**Cause:** Certificate not renewed (auto-renewal failed)

**Solution:**
```bash
ssh root@cratemusic.duckdns.org

cd /root/faiss-search-api

# Check certbot logs
docker logs kexp-certbot

# Force renewal
docker-compose run --rm --entrypoint certbot certbot renew --force-renewal

# Restart nginx
docker-compose restart nginx
```

## Verification Checklist

After any HTTPS-related changes, verify:

```bash
# 1. HTTP redirects to HTTPS
curl -I http://cratemusic.duckdns.org/api/health | grep "Location:"
# Expected: Location: https://cratemusic.duckdns.org/api/health

# 2. HTTPS serves API correctly
curl -s https://cratemusic.duckdns.org/api/health | jq '.status'
# Expected: "ok"

# 3. Certificate is valid
openssl s_client -connect cratemusic.duckdns.org:443 -servername cratemusic.duckdns.org < /dev/null 2>/dev/null | openssl x509 -noout -dates

# 4. Security headers present
curl -I https://cratemusic.duckdns.org/api/health | grep "Strict-Transport-Security"
# Expected: Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## Security Considerations

### HSTS (HTTP Strict Transport Security)
- Enabled with 1-year max-age
- Enforces HTTPS for all future requests
- Includes subdomains

### TLS Configuration
- Protocols: TLSv1.2, TLSv1.3
- Strong ciphers (Mozilla Intermediate profile)
- OCSP Stapling enabled

### Certificate Storage
- Private keys stored in `/root/faiss-search-api/certbot/conf/`
- Permissions: `root:root` with `644` for certs, `600` for private keys
- Backed up automatically by certbot

## Maintenance

### Monthly Tasks
- Verify certificate expiration date
- Check certbot renewal logs
- Test HTTPS access

### Quarterly Tasks
- Review nginx security headers
- Update TLS configuration if needed
- Audit nginx access logs

## References

- Let's Encrypt Documentation: https://letsencrypt.org/docs/
- Certbot Documentation: https://eff-certbot.readthedocs.io/
- Mozilla SSL Configuration Generator: https://ssl-config.mozilla.org/
- DuckDNS Documentation: https://www.duckdns.org/
