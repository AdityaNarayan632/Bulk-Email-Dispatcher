# Start from official Node.js image
FROM node:18-alpine

# Set working directory inside container
WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy rest of the code
COPY . .

# Expose API port
EXPOSE 3000

# Default command (overridden for worker in docker-compose)
CMD ["node", "app.js"]