import { headers } from "next/headers";
import QRCode from "qrcode";

// Where a family letter sends a parent, and the QR square that takes them there.
//
// THE QR POINTS AT THE SIGN-IN PAGE AND NOTHING ELSE. The code stays printed
// text that has to be typed. A QR carrying the code would make a photographed or
// dropped letter usable in one tap, which is the opposite of what a code on
// paper is for. That decision predates the whole-class sheet and survives it: a
// pile of thirty letters on a staffroom table is a stronger reason to keep the
// code out of the square, not a weaker one.
//
// Because the square is identical on every letter, the whole-class sheet
// generates it ONCE and reuses the markup for all thirty. That is the whole
// reason this lives here rather than inside the letter component: thirty async
// QR renders per print is a cost with nothing to show for it.
export async function familyLetterQr(): Promise<{ qrSvg: string; prettyUrl: string }> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "storyjar.co.uk";
  const proto =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");

  const qrSvg = (
    await QRCode.toString(`${proto}://${host}/family`, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#22304A", light: "#FFFDF7" },
    })
  ).replace("<svg ", '<svg width="100%" height="100%" ');

  return { qrSvg, prettyUrl: `${host}/family` };
}
