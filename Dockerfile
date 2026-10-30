FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run lint && bun run build

FROM oven/bun:1 AS runtime
USER root
ENV ANDROID_SDK_ROOT=/opt/android-sdk \
    ANDROID_HOME=/opt/android-sdk \
    ANDROID_SYSTEM_IMAGE=system-images;android-35;google_apis_playstore;x86_64
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl openjdk-17-jre-headless unzip \
      libasound2 libgl1 libnss3 libpulse0 libx11-6 libx11-xcb1 \
      libxcb1 libxcomposite1 libxcursor1 libxi6 libxrandr2 libxrender1 libxtst6 \
    && rm -rf /var/lib/apt/lists/*

ARG ANDROID_COMMAND_LINE_TOOLS_VERSION=13114758
RUN mkdir -p "${ANDROID_SDK_ROOT}/cmdline-tools" \
    && curl --fail --location --silent --show-error \
      "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_COMMAND_LINE_TOOLS_VERSION}_latest.zip" \
      -o /tmp/android-command-line-tools.zip \
    && unzip -q /tmp/android-command-line-tools.zip -d /tmp/android-command-line-tools \
    && mv /tmp/android-command-line-tools/cmdline-tools "${ANDROID_SDK_ROOT}/cmdline-tools/latest" \
    && rm -rf /tmp/android-command-line-tools /tmp/android-command-line-tools.zip \
    && yes | "${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin/sdkmanager" --sdk_root="${ANDROID_SDK_ROOT}" --licenses >/dev/null \
    && "${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin/sdkmanager" --sdk_root="${ANDROID_SDK_ROOT}" \
      "platform-tools" "emulator" "system-images;android-35;google_apis_playstore;x86_64"

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY server.ts ./
COPY src ./src
COPY --from=build /app/dist ./dist

RUN mkdir -p /data/android-devices \
    && chown -R bun:bun /app /data/android-devices "${ANDROID_SDK_ROOT}"

ENV NODE_ENV=production \
    ANDROID_EMULATOR_ENABLED=true \
    ANDROID_DATA_DIR=/data/android-devices \
    EMULATOR_GPU_MODE=swiftshader
USER bun
EXPOSE 3000
CMD ["bun", "run", "server.ts"]
