import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

// Sem infraestrutura de e-mail nenhuma configurada ainda (nenhum SMTP disponível neste
// ambiente) — sem SMTP_HOST, cai pro log (dev-safe, testável de ponta a ponta sem credenciais
// reais); com SMTP_HOST configurado no .env, manda de verdade via nodemailer. Interface única
// (`send`) pra quem chama (AuthService) nunca precisar saber qual dos dois caminhos está ativo.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async send(message: MailMessage): Promise<void> {
    const host = process.env.SMTP_HOST;
    if (!host) {
      this.logger.log(`[MailService] SMTP_HOST não configurado — e-mail não enviado, só logado:\n${JSON.stringify(message, null, 2)}`);
      return;
    }

    const transport = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM || 'DB Mobile <no-reply@dbmobile.local>',
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
