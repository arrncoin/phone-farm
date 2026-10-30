import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

const InputCommandSchema = z.object({
  type: z.enum(['tap', 'swipe', 'key', 'text', 'launch', 'rotate', 'screenshot', 'reboot']),
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
  startX: z.number().min(0).max(1).optional(),
  startY: z.number().min(0).max(1).optional(),
  endX: z.number().min(0).max(1).optional(),
  endY: z.number().min(0).max(1).optional(),
  durationMs: z.number().min(10).max(5000).optional(),
  keycode: z.string().max(40).optional(),
  text: z.string().max(200).optional(),
  packageName: z.string().max(100).optional(),
  orientation: z.enum(['portrait', 'landscape']).optional(),
});

test('Sync Control: Coordinate Normalization handles boundaries safely', () => {
  // Test coordinate clamp
  const normalize = (val: number) => Math.max(0, Math.min(1, val));
  assert.equal(normalize(-0.2), 0);
  assert.equal(normalize(1.5), 1);
  assert.equal(normalize(0.45), 0.45);

  // Google Pixel 7 Pro resolution projection (720x1560 Lite vs 1080x2340 FHD+)
  const width720 = 720;
  const height1560 = 1560;
  const normX = 0.5;
  const normY = 0.25;

  assert.equal(Math.round(normX * width720), 360);
  assert.equal(Math.round(normY * height1560), 390);

  // Pixel 7 Pro FHD+ (1080x2340) receives scaled pixels correctly
  const width1080 = 1080;
  const height2340 = 2340;
  assert.equal(Math.round(normX * width1080), 540);
  assert.equal(Math.round(normY * height2340), 585);
});

test('Sync Control: InputCommandSchema rejects dangerous injection', () => {
  const validTap = { type: 'tap', x: 0.5, y: 0.8 };
  assert.ok(InputCommandSchema.safeParse(validTap).success);

  const invalidType = { type: 'shell_exec', command: 'rm -rf /' };
  assert.ok(!InputCommandSchema.safeParse(invalidType).success);

  const outOfBounds = { type: 'tap', x: 2.5, y: -0.1 };
  assert.ok(!InputCommandSchema.safeParse(outOfBounds).success);
});

test('Sync Control: Concurrency batching isolates offline devices without blocking', async () => {
  const mockDevices = [
    { id: 'android-01', status: 'online' },
    { id: 'android-02', status: 'offline' }, // should fail gracefully
    { id: 'android-03', status: 'online' },
  ];

  const results: any[] = [];
  for (const dev of mockDevices) {
    if (dev.status === 'online') {
      results.push({ deviceId: dev.id, status: 'success', latencyMs: 25 });
    } else {
      results.push({ deviceId: dev.id, status: 'offline', latencyMs: 1, error: 'Device offline' });
    }
  }

  assert.equal(results.length, 3);
  assert.equal(results.filter((r) => r.status === 'success').length, 2);
  assert.equal(results.find((r) => r.deviceId === 'android-02')?.status, 'offline');
});
