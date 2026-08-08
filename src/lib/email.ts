// Email delivery via Google Workspace SMTP (app password). Node-only.
// Config (env): SMTP_USER (sender, e.g. dashboard@ldrsgroup.com), SMTP_PASS (Google app password),
// optional SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 465), SMTP_FROM (display name).
// No-op-safe: emailConfigured() is false until SMTP_USER + SMTP_PASS are set.
import nodemailer, { type Transporter } from "nodemailer";

export function emailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

let _tx: Transporter | null = null;
function transport(): Transporter {
  if (_tx) return _tx;
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) throw new Error("SMTP_USER / SMTP_PASS not configured");
  _tx = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user, pass },
  });
  return _tx;
}

export function fromAddress(): string {
  return process.env.SMTP_FROM || `Leaders Dashboard <${process.env.SMTP_USER}>`;
}

// Verify the SMTP connection + credentials without sending anything.
export async function verifyEmail(): Promise<void> {
  await transport().verify();
}

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}): Promise<void> {
  await transport().sendMail({
    from: fromAddress(),
    to: Array.isArray(opts.to) ? opts.to.join(", ") : opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    replyTo: opts.replyTo,
  });
}
