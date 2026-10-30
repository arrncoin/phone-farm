#!/bin/sh
set -e

echo "[Emulator Agent] Initializing Android 14 container environment..."
echo "[Emulator Agent] Checking /dev/kvm availability..."

if [ -e /dev/kvm ]; then
    echo "[Emulator Agent] KVM hardware acceleration detected!"
else
    echo "[Emulator Agent] WARNING: /dev/kvm not found! Running in software emulation mode."
fi

# Set display parameters for Google Pixel 7 Pro (Cheetah Lite Farm Profile)
WIDTH=${ANDROID_WIDTH:-720}
HEIGHT=${ANDROID_HEIGHT:-1560}
DPI=${ANDROID_DPI:-280}
FPS=${ANDROID_FPS:-24}

echo "[Emulator Agent] Google Pixel 7 Pro (cheetah) display set to ${WIDTH}x${HEIGHT} @ ${DPI}dpi (${FPS}fps)"

# Forward to base redroid / android entrypoint with Google Pixel 7 Pro identity
exec /init \
    androidboot.redroid_width=$WIDTH \
    androidboot.redroid_height=$HEIGHT \
    androidboot.redroid_dpi=$DPI \
    androidboot.redroid_fps=$FPS \
    androidboot.use_memfd=1 \
    ro.product.brand=google \
    ro.product.manufacturer=Google \
    ro.product.model="Pixel 7 Pro" \
    ro.product.name=cheetah \
    ro.product.device=cheetah \
    ro.build.product=cheetah \
    ro.build.flavor=cheetah-user \
    ro.build.id=UQ1A.240205.004 \
    ro.build.fingerprint="google/cheetah/cheetah:14/UQ1A.240205.004/11269623:user/release-keys"
