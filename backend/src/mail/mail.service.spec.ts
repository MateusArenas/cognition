import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer');

describe('MailService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  it('sem SMTP_HOST, não chama nodemailer (cai pro log)', async () => {
    delete process.env.SMTP_HOST;
    const service = new MailService();
    await service.send({ to: 'ana@exemplo.com', subject: 'Assunto', text: 'Corpo' });
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('com SMTP_HOST configurado, monta o transport e chama sendMail com a mensagem certa', async () => {
    process.env.SMTP_HOST = 'smtp.exemplo.com';
    process.env.SMTP_PORT = '2525';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    process.env.SMTP_FROM = 'Teste <teste@exemplo.com>';

    const sendMail = jest.fn().mockResolvedValue(undefined);
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    const service = new MailService();
    await service.send({ to: 'ana@exemplo.com', subject: 'Assunto', text: 'Corpo' });

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.exemplo.com', port: 2525, auth: { user: 'user', pass: 'pass' } })
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Teste <teste@exemplo.com>', to: 'ana@exemplo.com', subject: 'Assunto', text: 'Corpo' })
    );
  });
});
