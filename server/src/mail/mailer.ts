import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';
import { logger } from '../logger.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  if (!config.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });
  return transporter;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(msg: MailMessage): Promise<void> {
  const t = getTransporter();
  if (!t) {
    // Dev mode: print to log instead of sending. Lets the user copy
    // verification links out of the terminal without setting up SMTP.
    logger.info(
      { to: msg.to, subject: msg.subject, body: msg.text },
      '✉️  [dev] mail (no SMTP configured)',
    );
    return;
  }
  await t.sendMail({
    from: config.SMTP_FROM,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
}

export function emailLink(path: string): string {
  return new URL(path, config.PUBLIC_URL).toString();
}
