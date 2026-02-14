type BibEmailTemplateInput = {
  siteUrl: string;
  preheader: string;
  recipientName: string;
  title: string;
  intro: string;
  spotlightLabel?: string;
  spotlightValue?: string;
  messageLabel?: string;
  messageValue?: string;
  ctaLabel: string;
  ctaUrl: string;
  footerNote?: string;
};

function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, '');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildBibEmailTemplate(input: BibEmailTemplateInput): string {
  const safeSiteUrl = normalizeSiteUrl(input.siteUrl || 'https://bingeitbro.com');
  const logoUrl = `${safeSiteUrl}/email-logo.png`;
  const safePreheader = escapeHtml(input.preheader);
  const safeRecipient = escapeHtml(input.recipientName);
  const safeTitle = escapeHtml(input.title);
  const safeIntro = escapeHtml(input.intro);
  const safeCtaLabel = escapeHtml(input.ctaLabel);
  const safeCtaUrl = escapeHtml(input.ctaUrl);
  const safeSpotlightLabel = input.spotlightLabel ? escapeHtml(input.spotlightLabel) : '';
  const safeSpotlightValue = input.spotlightValue ? escapeHtml(input.spotlightValue) : '';
  const safeMessageLabel = input.messageLabel ? escapeHtml(input.messageLabel) : '';
  const safeMessageValue = input.messageValue ? escapeHtml(input.messageValue) : '';
  const safeFooterNote = input.footerNote ? escapeHtml(input.footerNote) : '';

  const spotlightBlock =
    safeSpotlightLabel && safeSpotlightValue
      ? `
        <tr>
          <td style="padding:0 24px 12px 24px;">
            <div style="border:1px solid #23283b;border-radius:12px;background:#101426;padding:14px 16px;">
              <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#9aa3bc;margin-bottom:6px;">${safeSpotlightLabel}</div>
              <div style="font-size:22px;line-height:1.32;font-weight:700;color:#f6f8ff;">${safeSpotlightValue}</div>
            </div>
          </td>
        </tr>
      `
      : '';

  const messageBlock =
    safeMessageLabel && safeMessageValue
      ? `
        <tr>
          <td style="padding:0 24px 12px 24px;">
            <div style="border:1px solid #2e354f;border-radius:12px;background:#0f1322;padding:12px 14px;">
              <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#a9b3cf;margin-bottom:6px;">${safeMessageLabel}</div>
              <div style="font-size:14px;line-height:1.55;color:#d4daee;">${safeMessageValue}</div>
            </div>
          </td>
        </tr>
      `
      : '';

  const footerNoteBlock = safeFooterNote
    ? `<div style="margin-top:8px;color:#8e97b1;">${safeFooterNote}</div>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Binge it bro</title>
  </head>
  <body style="margin:0;padding:0;background:#070b14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safePreheader}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#070b14;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;border:1px solid #1c2335;border-radius:18px;background:#0c1120;overflow:hidden;">
            <tr>
              <td style="padding:22px 24px 16px 24px;border-bottom:1px solid #1f2639;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img src="${logoUrl}" alt="Binge it bro" width="132" style="display:block;border:0;outline:none;text-decoration:none;height:auto;" />
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 8px 24px;">
                <div style="font-size:15px;line-height:1.5;color:#d8def2;">Hi ${safeRecipient},</div>
                <div style="margin-top:8px;font-size:24px;line-height:1.32;font-weight:700;color:#f5f7ff;">${safeTitle}</div>
                <div style="margin-top:8px;font-size:14px;line-height:1.55;color:#aeb7d3;">${safeIntro}</div>
              </td>
            </tr>
            ${spotlightBlock}
            ${messageBlock}
            <tr>
              <td style="padding:12px 24px 22px 24px;">
                <a href="${safeCtaUrl}" style="display:inline-block;background:#f59e0b;color:#141009;text-decoration:none;font-size:14px;font-weight:700;padding:11px 18px;border-radius:999px;">${safeCtaLabel}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 20px 24px;font-size:12px;line-height:1.55;color:#7f88a4;">
                This is a transactional email from BiB.
                ${footerNoteBlock}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
