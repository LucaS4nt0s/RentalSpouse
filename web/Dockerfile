FROM node:24-alpine

WORKDIR /app

# Copia os pacotes compartilhados e as dependências da aplicação web
COPY packages/ ./packages/
COPY web/package.json web/package-lock.json ./web/

WORKDIR /app/web
RUN npm ci --no-audit --no-fund --loglevel=warn

# Copia código fonte da aplicação web
COPY web/ ./

# Garante a compilação do pacote compartilhado antes da inicialização
RUN npm run build:search

EXPOSE 3000

CMD ["npm", "run", "dev"]
