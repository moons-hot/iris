import { scanUsbVoiceSource } from "@/lib/usb-voice.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const inventory = await scanUsbVoiceSource();
  return Response.json(inventory);
}
