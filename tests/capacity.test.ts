import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEmulatorCapacity } from '../src/services/capacity.ts';

test('emulator capacity reserves host resources and is bounded by the configured maximum', () => {
  assert.deepEqual(
    calculateEmulatorCapacity({ totalMemoryMb: 65536, cpuCores: 24, kvmAvailable: true, maxDevices: 10 }),
    { maxDevices: 10, memoryLimitMb: 65536, cpuLimitCores: 24, reason: undefined },
  );
  assert.equal(
    calculateEmulatorCapacity({ totalMemoryMb: 16384, cpuCores: 8, kvmAvailable: true }).maxDevices,
    3,
  );
});

test('emulator capacity is zero without KVM or host reserve', () => {
  assert.equal(
    calculateEmulatorCapacity({ totalMemoryMb: 65536, cpuCores: 32, kvmAvailable: false }).maxDevices,
    0,
  );
  assert.equal(
    calculateEmulatorCapacity({ totalMemoryMb: 4096, cpuCores: 4, kvmAvailable: true }).maxDevices,
    0,
  );
});
