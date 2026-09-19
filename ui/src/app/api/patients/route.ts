import { NextResponse } from "next/server";

import { getStore } from "@/server/store";

export async function GET(): Promise<NextResponse> {
  const store = getStore();
  const [patients, devices] = await Promise.all([
    store.listPatients(),
    store.listDevices(),
  ]);

  return NextResponse.json({
    patients,
    // Device ids only. Secrets never leave the server.
    devices: devices.map((device) => ({ id: device.id, label: device.label })),
    store: store.kind,
  });
}
