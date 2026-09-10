import { headers } from "next/headers";
import QRCode from "qrcode";

// The QR square that drops a device onto a class's sign-in page, as an image
// data URL. It carries the class code (the same one printed on the classroom
// door, so it grants nothing the door does not), and it is an <img> src rather
// than injected markup, so it needs no new reviewed exception in the static gate. Built
// from the request host so it works in dev and in production alike; the
// welcome sheet builds its URL the same way.
export async function classSignInQrDataUrl(classCode: string): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "storyjar.co.uk";
  const proto =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const svg = await QRCode.toString(`${proto}://${host}/login/student?code=${classCode}`, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#22304A", light: "#FFFDF7" },
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
