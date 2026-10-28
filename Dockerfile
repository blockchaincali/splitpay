# SplitPay v2: one container serves the built app and the API.
FROM oven/bun:1.3
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ARG VITE_SPLITPAY_ADDRESS
ARG VITE_SPLITPAY_DEPLOY_BLOCK
ENV VITE_SPLITPAY_ADDRESS=$VITE_SPLITPAY_ADDRESS VITE_SPLITPAY_DEPLOY_BLOCK=$VITE_SPLITPAY_DEPLOY_BLOCK
RUN bun run build
ENV APP_ENV=production PORT=7860 DATABASE_PATH=/data/splitpay.db
VOLUME ["/data"]
EXPOSE 7860
CMD ["bun", "run", "server/index.ts"]
