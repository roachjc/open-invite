import twilio from "twilio";

// Integration primitives only. Never use the demo's sample phone numbers for live delivery.
export function validTwilioRequest(
  signature: string,
  publicWebhookUrl: string,
  fields: Record<string, string>,
): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return false;
  return twilio.validateRequest(token, signature, publicWebhookUrl, fields);
}

export async function sendNotification(to: string, body: string) {
  if (process.env.OPEN_INVITE_LIVE_SMS !== "true")
    throw new Error("Live SMS is disabled.");
  const {
    TWILIO_ACCOUNT_SID: sid,
    TWILIO_AUTH_TOKEN: token,
    TWILIO_PHONE_NUMBER: from,
  } = process.env;
  if (!sid || !token || !from) throw new Error("Twilio is not configured.");
  if (/^\+120255501\d\d$/.test(to))
    throw new Error("Sample phone numbers cannot receive live SMS.");
  return twilio(sid, token).messages.create({ from, to, body });
}
