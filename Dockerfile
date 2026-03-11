FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Build
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Run
EXPOSE 3000
CMD ["npm", "start"]
