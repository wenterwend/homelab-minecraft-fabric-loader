FROM node:22-alpine
WORKDIR /app

ENV PORT=3001
ENV MODS_DIR=/mods
ENV MINECRAFT_VERSION=1.21.1

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

EXPOSE 3001

ENV NODE_ENV=production
CMD ["npm", "run", "start"]