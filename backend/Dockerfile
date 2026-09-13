# Single-stage build for Node.js backend using tsx (no TypeScript compilation needed)

FROM docker.io/library/node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including tsx for runtime TypeScript execution)
RUN npm ci

# Copy source code and migrations
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application using tsx (TypeScript execution)
CMD ["npx", "tsx", "src/server.ts"]
