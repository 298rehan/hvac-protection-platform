"use client";

import { useRef, useState, type FormEvent } from "react";

import { Field, Input, Textarea } from "@/components/form";
import { Alert, Button, Card, CheckIcon } from "@/components/ui";
import {
  CONTACT_API_URL,
  ContactError,
  sendContactMessage,
  type ContactFieldErrors,
  type ContactPayload,
} from "@/services/contactService";

const EMPTY: ContactPayload = { name: "", email: "", message: "" };
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 5000;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;

/** Same rules as the server, so most mistakes are caught before sending. */
function validate(form: ContactPayload): ContactFieldErrors {
  const errors: ContactFieldErrors = {};
  const name = form.name.trim();
  const email = form.email.trim();
  const message = form.message.trim();

  if (!name) errors.name = "Please enter your name.";
  else if (name.length > 100) errors.name = "Name can be up to 100 characters.";

  if (!email) errors.email = "Please enter your email address.";
  else if (email.length > 254 || !EMAIL_PATTERN.test(email)) errors.email = "Please enter a valid email address.";

  if (message.length < MESSAGE_MIN) errors.message = `Please write at least ${MESSAGE_MIN} characters.`;
  else if (message.length > MESSAGE_MAX) errors.message = `Messages can be up to ${MESSAGE_MAX} characters.`;

  return errors;
}

export function ContactForm() {
  const [form, setForm] = useState<ContactPayload>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<ContactFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  // Blocks a second submit even before React re-renders the disabled button.
  const inFlight = useRef(false);

  function update(key: keyof ContactPayload, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    setError(null);

    const errors = validate(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    inFlight.current = true;
    setSubmitting(true);
    try {
      await sendContactMessage({
        name: form.name.trim(),
        email: form.email.trim(),
        message: form.message.trim(),
      });
      setSent(true);
      setForm(EMPTY);
    } catch (caught) {
      const failure = caught instanceof ContactError ? caught : new ContactError("Something went wrong.");
      setError(failure.message);
      setFieldErrors(failure.fields);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <Card className="p-8 text-center sm:p-10" role="status">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
          <CheckIcon className="h-6 w-6" />
        </span>
        <h2 className="mt-5 text-xl font-semibold text-slate-900">Message sent</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
          Thank you for contacting Summit Air. Our team has received your message and will reply
          to the email address you provided.
        </p>
        <Button variant="secondary" className="mt-6" onClick={() => setSent(false)}>
          Send another message
        </Button>
      </Card>
    );
  }

  const unavailable = !CONTACT_API_URL;

  return (
    <Card className="p-6 sm:p-8">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {unavailable ? (
          <Alert tone="info">The contact form is not available right now. Please try again later.</Alert>
        ) : null}
        {error ? <Alert>{error}</Alert> : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Your name" htmlFor="contact-name" error={fieldErrors.name}>
            <Input
              id="contact-name"
              autoComplete="name"
              maxLength={100}
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
            />
          </Field>
          <Field label="Email address" htmlFor="contact-email" error={fieldErrors.email}>
            <Input
              id="contact-email"
              type="email"
              autoComplete="email"
              maxLength={254}
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              aria-invalid={Boolean(fieldErrors.email)}
            />
          </Field>
        </div>

        <Field
          label="Message or complaint"
          htmlFor="contact-message"
          hint={`${form.message.trim().length} / ${MESSAGE_MAX} characters`}
          error={fieldErrors.message}
        >
          <Textarea
            id="contact-message"
            rows={7}
            maxLength={MESSAGE_MAX}
            value={form.message}
            onChange={(e) => update("message", e.target.value)}
            aria-invalid={Boolean(fieldErrors.message)}
            placeholder="Tell us how we can help - include your plan or service request number if you have one."
          />
        </Field>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">We only use your details to reply to this message.</p>
          <Button type="submit" disabled={submitting || unavailable} className="sm:min-w-40">
            {submitting ? "Sending..." : "Send message"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
