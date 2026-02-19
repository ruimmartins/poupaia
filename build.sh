#!/bin/bash
set -e

echo "Building packages..."
pnpm --filter @poupaia/db build
pnpm --filter @poupaia/messaging build
pnpm --filter @poupaia/ai build

echo "Copying packages to node_modules..."
cp -r packages/db/dist node_modules/@poupaia/db/
cp -r packages/messaging/dist node_modules/@poupaia/messaging/
cp -r packages/ai/dist node_modules/@poupaia/ai/
cp packages/db/package.json node_modules/@poupaia/db/
cp packages/messaging/package.json node_modules/@poupaia/messaging/
cp packages/ai/package.json node_modules/@poupaia/ai/

echo "Build complete!"
