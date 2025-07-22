# Use Node.js base image
FROM node:latest

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy environment file
COPY .env .env

# Copy source files
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Start server
CMD ["node", "src/server.js"]
