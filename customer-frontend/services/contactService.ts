/**
 * Contact Us submissions go to a separate AWS endpoint
 * (API Gateway -> Lambda), not the FastAPI backend.
 *
 * NEXT_PUBLIC_CONTACT_API_URL is a public URL baked in at build time. It is not
 * a secret, and no AWS credentials are ever used in the browser.
 */

export const CONTACT_API_URL = process.env.NEXT_PUBLIC_CONTACT_API_URL ?? "";

export type ContactPayload = { name: string; email: string; message: string };
export type ContactFieldErrors = Partial<Record<keyof ContactPayload, string>>;

export class ContactError extends Error {
  fields: ContactFieldErrors;

  constructor(message: string, fields: ContactFieldErrors = {}) {
    super(message);
    this.fields = fields;
  }
}

export async function sendContactMessage(payload: ContactPayload): Promise<void> {
  if (!CONTACT_API_URL) {
    throw new ContactError("The contact form is not available right now.");
  }

  let response: Response;
  try {
    response = await fetch(CONTACT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ContactError("We couldn't reach the server. Check your connection and try again.");
  }

  if (response.ok) return;

  const body = await response.json().catch(() => ({}));
  if (response.status === 429) {
    throw new ContactError("Too many messages were sent just now. Please wait a minute and try again.");
  }
  throw new ContactError(
    typeof body.error === "string" ? body.error : "Sorry, we couldn't send your message. Please try again later.",
    body.fields ?? {},
  );
}
