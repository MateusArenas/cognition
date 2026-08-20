# Build da própria API — opcional pro dia a dia (docker-compose.yml na raiz só sobe o Postgres
# de dados próprios; rodar o backend com `npm run start:dev` local é mais rápido pra
# desenvolver). Serve pra empacotar o backend quando for hora de publicar de verdade.
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/generated ./src/generated
COPY --from=build /app/prisma ./prisma
EXPOSE 3333
CMD ["node", "dist/src/main.js"]
