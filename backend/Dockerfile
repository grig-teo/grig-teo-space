FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY scripts ./scripts
RUN apk add --no-cache python3 py3-pip ffmpeg \
  && pip3 install --no-cache-dir --break-system-packages -r scripts/requirements.txt
RUN mkdir -p generated
EXPOSE 3001
CMD ["node", "dist/main.js"]
