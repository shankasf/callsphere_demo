import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { PrismaService } from '../prisma/prisma.service';

export interface DemoLeadInput {
  email: string;
  name?: string;
  industrySlug?: string;
  industryName?: string;
}

export interface DemoLeadResult {
  ok: boolean;
  emailed: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class DemoService {
  private readonly logger = new Logger('DemoService');
  private readonly ses: SESClient | null;
  private readonly region: string;
  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.region = this.config.get<string>('AWS_REGION') || 'us-east-1';
    // Sender lives on the SES-verified mail.callsphere.site domain identity.
    this.fromAddress =
      this.config.get<string>('DEMO_MAIL_FROM') || 'demo@mail.callsphere.site';
    this.fromName =
      this.config.get<string>('DEMO_MAIL_FROM_NAME') || 'CallSphere Demo';

    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');
    if (accessKeyId && secretAccessKey) {
      this.ses = new SESClient({
        region: this.region,
        credentials: { accessKeyId, secretAccessKey },
      });
    } else {
      this.ses = null;
      this.logger.warn(
        'AWS credentials not set — demo confirmation emails are disabled.',
      );
    }
  }

  /**
   * Capture a demo visitor's email, persist it, and send a confirmation email
   * via AWS SES. Persistence always happens; an email failure is reported but
   * never blocks the visitor from entering the demo.
   */
  async captureLead(input: DemoLeadInput): Promise<DemoLeadResult> {
    const email = (input.email || '').trim().toLowerCase();
    if (!this.isValidEmail(email)) {
      return { ok: false, emailed: false, error: 'invalid_email' };
    }

    const name = (input.name || '').trim() || null;
    const industrySlug = (input.industrySlug || '').trim() || null;
    const industryName = (input.industryName || '').trim() || null;

    let messageId: string | undefined;
    let emailed = false;
    let emailError: string | undefined;

    if (this.ses) {
      try {
        messageId = await this.sendConfirmation(
          email,
          name,
          industryName,
          industrySlug,
        );
        emailed = true;
      } catch (e: any) {
        emailError = e?.message || String(e);
        this.logger.error(`SES send failed for ${email}: ${emailError}`);
      }
    } else {
      emailError = 'email_disabled';
    }

    // Persist the lead (best-effort; never throws to the caller).
    try {
      await this.prisma.$executeRaw`
        INSERT INTO demo_leads (email, name, industry_slug, industry_name, source, message_id, email_status)
        VALUES (${email}, ${name}, ${industrySlug}, ${industryName}, 'demo_web', ${messageId ?? null},
                ${emailed ? 'sent' : emailError ?? 'failed'})
      `;
    } catch (e: any) {
      this.logger.error(`Failed to persist demo lead ${email}: ${e?.message}`);
    }

    return { ok: true, emailed, messageId, error: emailError };
  }

  /**
   * Aggregated chatbot metrics for the dashboard. Reads from
   * demo_chat_messages (chat turns) + demo_appointments (bookings).
   * `range` is one of 7d | 30d | all; `industry` is a slug or 'all'.
   */
  async getChatbotMetrics(industry = 'all', range = '7d'): Promise<any> {
    const days = range === '30d' ? 30 : range === 'all' ? null : 7;
    const sinceSql = days ? `created_at >= now() - interval '${days} days'` : 'TRUE';
    const indClause =
      industry && industry !== 'all'
        ? `AND industry_slug = ${this.q(industry)}`
        : '';

    const totalsRows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*)::int AS messages,
        COUNT(DISTINCT session_id)::int AS sessions,
        COALESCE(SUM(array_length(tool_calls,1)),0)::int AS tool_calls,
        COUNT(*) FILTER (WHERE 'book_appointment' = ANY(tool_calls))::int AS book_calls,
        COUNT(*) FILTER (WHERE 'search_knowledge' = ANY(tool_calls))::int AS kb_calls
      FROM demo_chat_messages
      WHERE ${sinceSql} ${indClause}
    `);
    const totals = totalsRows[0] || {};

    // Bookings made *from chat* = appointments whose session is a chat session.
    const bookingsRows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*)::int AS bookings,
             COUNT(*) FILTER (WHERE a.confirmation_sent)::int AS emailed,
             COUNT(DISTINCT a.session_id)::int AS booking_sessions
      FROM demo_appointments a
      WHERE a.session_id IN (
        SELECT DISTINCT session_id FROM demo_chat_messages
        WHERE ${sinceSql} ${indClause}
      )
      ${days ? `AND a.created_at >= now() - interval '${days} days'` : ''}
    `);
    const bookings = bookingsRows[0] || {};

    const byIndustry = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT m.industry_slug AS slug,
             COALESCE(m.industry_name, m.industry_slug) AS name,
             COUNT(*)::int AS messages,
             COUNT(DISTINCT m.session_id)::int AS sessions
      FROM demo_chat_messages m
      WHERE ${sinceSql}
      GROUP BY m.industry_slug, m.industry_name
      ORDER BY messages DESC
    `);

    const topServices = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT a.service, COUNT(*)::int AS count
      FROM demo_appointments a
      WHERE a.session_id IN (
        SELECT DISTINCT session_id FROM demo_chat_messages
        WHERE ${sinceSql} ${indClause}
      )
      ${days ? `AND a.created_at >= now() - interval '${days} days'` : ''}
      GROUP BY a.service ORDER BY count DESC LIMIT 8
    `);

    const daily = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS messages,
             COUNT(DISTINCT session_id)::int AS sessions
      FROM demo_chat_messages
      WHERE created_at >= now() - interval '${days || 14} days' ${indClause}
      GROUP BY 1 ORDER BY 1
    `);

    const recent = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT session_id, industry_name, user_message, assistant_message,
             tool_calls, to_char(created_at,'YYYY-MM-DD HH24:MI') AS at
      FROM demo_chat_messages
      WHERE ${sinceSql} ${indClause}
      ORDER BY created_at DESC LIMIT 12
    `);

    const sessions = totals.sessions || 0;
    const messages = totals.messages || 0;
    return {
      range,
      industry,
      totals: {
        sessions,
        messages,
        avgMessagesPerSession: sessions ? +(messages / sessions).toFixed(1) : 0,
        bookings: bookings.bookings || 0,
        emailsSent: bookings.emailed || 0,
        conversionRate: sessions
          ? +(
              (Math.min(bookings.booking_sessions || 0, sessions) / sessions) *
              100
            ).toFixed(1)
          : 0,
        toolCalls: totals.tool_calls || 0,
        bookToolCalls: totals.book_calls || 0,
        kbToolCalls: totals.kb_calls || 0,
      },
      byIndustry,
      topServices,
      daily,
      recent,
    };
  }

  // Single-quote-escape a string for safe inline SQL literal use.
  private q(s: string): string {
    return `'${String(s).replace(/'/g, "''")}'`;
  }

  private async sendConfirmation(
    to: string,
    name: string | null,
    industryName: string | null,
    industrySlug: string | null,
  ): Promise<string> {
    const greetingName = name ? `, ${name}` : '';
    const industryLine = industryName
      ? `the <strong>${this.escape(industryName)}</strong> experience`
      : 'the live demo';
    const industryLineText = industryName
      ? `the ${industryName} experience`
      : 'the live demo';

    const dashboardUrl = industrySlug
      ? `https://demo.callsphere.site/overview?industry=${encodeURIComponent(industrySlug)}`
      : 'https://demo.callsphere.site/start';

    const subject = industryName
      ? `Your CallSphere ${industryName} demo is ready`
      : 'Your CallSphere demo is ready';

    const html = this.buildHtml(
      greetingName,
      industryLine,
      dashboardUrl,
    );
    const text = this.buildText(
      greetingName,
      industryLineText,
      dashboardUrl,
    );

    const cmd = new SendEmailCommand({
      Source: `${this.fromName} <${this.fromAddress}>`,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: html, Charset: 'UTF-8' },
          Text: { Data: text, Charset: 'UTF-8' },
        },
      },
    });

    const res = await this.ses!.send(cmd);
    this.logger.log(
      `Demo confirmation sent to ${to} (MessageId=${res.MessageId})`,
    );
    return res.MessageId as string;
  }

  private buildHtml(
    greetingName: string,
    industryLine: string,
    dashboardUrl: string,
  ): string {
    return `<!doctype html>
<html>
  <body style="margin:0;background:#0b0f17;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e5e9f0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f17;padding:32px 0;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#121826;border:1px solid #1f2937;border-radius:16px;overflow:hidden;">
          <tr><td style="padding:28px 32px 8px 32px;">
            <p style="margin:0;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#7c8aa5;">CallSphere</p>
            <h1 style="margin:8px 0 0 0;font-size:22px;color:#ffffff;">Thanks for trying our AI demo${greetingName}!</h1>
          </td></tr>
          <tr><td style="padding:12px 32px 0 32px;font-size:15px;line-height:1.6;color:#cbd5e1;">
            <p style="margin:0 0 14px 0;">This email confirms you're exploring ${industryLine} on the CallSphere demo. Our AI voice &amp; chat agents handle calls and messages for businesses across healthcare, dental, insurance, logistics, body care, and more — booking appointments, capturing leads, answering questions, and routing urgent callers 24/7.</p>
            <p style="margin:0 0 22px 0;">Jump back into your demo dashboard any time:</p>
          </td></tr>
          <tr><td style="padding:0 32px 8px 32px;">
            <a href="${dashboardUrl}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">Open my demo dashboard</a>
          </td></tr>
          <tr><td style="padding:20px 32px 28px 32px;font-size:13px;line-height:1.6;color:#7c8aa5;border-top:1px solid #1f2937;">
            <p style="margin:14px 0 0 0;">Questions? Just reply to this email and our team will help.</p>
            <p style="margin:8px 0 0 0;">— The CallSphere Team · <a href="https://callsphere.ai" style="color:#818cf8;text-decoration:none;">callsphere.ai</a></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  }

  private buildText(
    greetingName: string,
    industryLineText: string,
    dashboardUrl: string,
  ): string {
    return [
      `Thanks for trying our AI demo${greetingName}!`,
      '',
      `This email confirms you're exploring ${industryLineText} on the CallSphere demo. Our AI voice & chat agents handle calls and messages for businesses across healthcare, dental, insurance, logistics, body care, and more — booking appointments, capturing leads, answering questions, and routing urgent callers 24/7.`,
      '',
      `Open your demo dashboard: ${dashboardUrl}`,
      '',
      'Questions? Just reply to this email and our team will help.',
      '— The CallSphere Team · callsphere.ai',
    ].join('\n');
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private escape(s: string): string {
    return s.replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
    );
  }
}
