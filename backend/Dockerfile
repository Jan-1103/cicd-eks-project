FROM node:20-alpine
RUN apk upgrade --no-cache
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY src ./src
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
