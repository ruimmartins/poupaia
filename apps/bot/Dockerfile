FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter bot... build
RUN pnpm deploy --filter=bot --prod /prod/bot

FROM node:20-slim
COPY --from=build /prod/bot /prod/bot
WORKDIR /prod/bot
EXPOSE 3000
CMD [ "npm", "start" ]
