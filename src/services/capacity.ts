export interface EmulatorCapacityInput {
  totalMemoryMb: number;
  cpuCores: number;
  kvmAvailable: boolean;
  maxDevices?: number;
  memoryPerDeviceMb?: number;
  vcpusPerDevice?: number;
  reserveMemoryMb?: number;
  hostOverheadPerDeviceMb?: number;
  reserveCpuCores?: number;
}

export interface EmulatorCapacity {
  maxDevices: number;
  memoryLimitMb: number;
  cpuLimitCores: number;
  reason?: string;
}

export function calculateEmulatorCapacity(input: EmulatorCapacityInput): EmulatorCapacity {
  const maxDevices = Math.max(0, Math.floor(input.maxDevices ?? 10));
  const memoryPerDeviceMb = Math.max(512, Math.floor(input.memoryPerDeviceMb ?? 2048));
  const vcpusPerDevice = Math.max(1, Math.floor(input.vcpusPerDevice ?? 2));
  const reserveMemoryMb = Math.max(0, Math.floor(input.reserveMemoryMb ?? 4096));
  const hostOverheadPerDeviceMb = Math.max(0, Math.floor(input.hostOverheadPerDeviceMb ?? 2048));
  const reserveCpuCores = Math.max(0, Math.floor(input.reserveCpuCores ?? 2));
  const memoryLimitMb = Math.max(0, Math.floor(input.totalMemoryMb));
  const cpuLimitCores = Math.max(0, Math.floor(input.cpuCores));

  if (!input.kvmAvailable) {
    return { maxDevices: 0, memoryLimitMb, cpuLimitCores, reason: 'KVM is unavailable; hardware-accelerated emulators cannot start.' };
  }

  const memoryCapacity = Math.floor(
    Math.max(0, memoryLimitMb - reserveMemoryMb) / (memoryPerDeviceMb + hostOverheadPerDeviceMb),
  );
  const cpuCapacity = Math.floor(Math.max(0, cpuLimitCores - reserveCpuCores) / vcpusPerDevice);
  const capacity = Math.min(maxDevices, memoryCapacity, cpuCapacity);

  return {
    maxDevices: capacity,
    memoryLimitMb,
    cpuLimitCores,
    reason: capacity === 0
      ? 'Host resources are below the minimum reserved memory and CPU requirements.'
      : undefined,
  };
}
