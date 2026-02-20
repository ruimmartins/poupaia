FROM mcr.microsoft.com/playwright:v1.50.0-jammy AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
# Instalar browsers do Playwright
RUN pnpm --filter scraper exec playwright install --with-deps chromium

FROM base
COPY --from=build /usr/src/app /usr/src/app
WORKDIR /usr/src/app/apps/scraper
# O scraper precisa do contexto do monorepo para aceder aos packages (@poupaia/db, etc)
# Por isso mantemos a estrutura, mas o WORKDIR é na app
CMD [ "pnpm", "start" ]
