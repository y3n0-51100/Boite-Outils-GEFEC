/* Contrôle du client SMTP de send-campagne-mail.
   ------------------------------------------------------------------
   La fonction Edge parle SMTP directement (denomailer écrivait le message
   ligne par ligne et faisait sauter le budget CPU sur 5 Mo de pièces
   jointes). Un client SMTP écrit à la main se vérifie : ce script rejoue
   ici, en Node, les mêmes fonctions pures et la même conversation, contre
   un faux serveur SMTP — et contrôle qu'un PDF de 5 Mo ressort identique
   au bit près, que les lignes respectent la limite SMTP et que le sujet
   accentué est correctement encodé.

       node scripts/test-smtp-campagne.js

   À rejouer si la construction du message ou le dialogue changent. */
const net = require('net');
const assert = require('assert');

const ENC = new TextEncoder();
const toBase64 = (b) => Buffer.from(b).toString('base64');
const b64text = (s) => toBase64(ENC.encode(s));

function splitAddr(v) {
  const m = String(v ?? '').match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || '', email: m[2].trim() } : { name: '', email: String(v ?? '').trim() };
}
const bareAddr = (v) => splitAddr(v).email;

function encodeHeader(s) {
  const t = String(s ?? '');
  if (!/[^\x20-\x7e]/.test(t)) return t;
  const words = []; let cur = '';
  for (const ch of t) {
    if (ENC.encode(cur + ch).length > 42) { words.push(cur); cur = ch; }
    else cur += ch;
  }
  if (cur) words.push(cur);
  return words.map((w) => `=?UTF-8?B?${b64text(w)}?=`).join('\r\n ');
}
function headerAddr(v) {
  const a = splitAddr(v);
  return a.name ? `${encodeHeader(a.name)} <${a.email}>` : `<${a.email}>`;
}
function wrap76(s) {
  const out = [];
  for (let i = 0; i < s.length; i += 76) out.push(s.slice(i, i + 76));
  return out.join('\r\n');
}

function mimeParts(o) {
  const mix = `--gefec-mix-${crypto.randomUUID()}`;
  const alt = `--gefec-alt-${crypto.randomUUID()}`;
  const parts = [];
  parts.push([
    `From: ${headerAddr(o.from)}`,
    `To: <${o.to}>`,
    `Subject: ${encodeHeader(o.subject)}`,
    ...(o.replyTo ? [`Reply-To: <${bareAddr(o.replyTo)}>`] : []),
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@boite-outils-gefec>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mix}"`,
    '',
    `--${mix}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    '',
    `--${alt}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64text(o.text)),
    `--${alt}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64text(o.html)),
    `--${alt}--`,
    '',
  ].join('\r\n'));
  for (const a of o.attachments) {
    parts.push([
      `--${mix}`,
      `Content-Type: application/pdf; name="${a.filename}"`,
      `Content-Disposition: attachment; filename="${a.filename}"`,
      'Content-Transfer-Encoding: base64',
      '', '',
    ].join('\r\n'));
    parts.push(wrap76(a.b64));
    parts.push('\r\n');
  }
  parts.push(`--${mix}--`);
  return parts;
}

/* La classe Smtp, portée sur un socket Node (mêmes règles d'analyse). */
class Smtp {
  constructor(sock) {
    this.sock = sock; this.buf = ''; this.waiters = [];
    sock.on('data', (d) => { this.buf += d.toString('utf8'); this._pump(); });
  }
  _pump() { while (this.waiters.length && this._try(this.waiters[0])) this.waiters.shift(); }
  _try(w) {
    for (;;) {
      const nl = this.buf.indexOf('\n');
      if (nl < 0) return false;
      const line = this.buf.slice(0, nl).replace(/\r$/, '');
      this.buf = this.buf.slice(nl + 1);
      w.lines.push(line);
      if (/^\d{3}(?: |$)/.test(line)) {
        w.resolve({ code: Number(line.slice(0, 3)), text: w.lines.join(' ').trim() });
        return true;
      }
    }
  }
  reply() {
    return new Promise((resolve) => {
      const w = { lines: [], resolve };
      this.waiters.push(w);
      this._pump();
    });
  }
  send(s) { return new Promise((r) => this.sock.write(s, r)); }
  async cmd(line, ok, label) {
    await this.send(line + '\r\n');
    const r = await this.reply();
    if (!ok.includes(r.code)) throw new Error(`${label} refusé — ${r.text}`);
    return r;
  }
}

async function sendSmtp(o, port) {
  const sock = net.connect({ host: '127.0.0.1', port });
  await new Promise((r) => sock.once('connect', r));
  const s = new Smtp(sock);
  const hello = await s.reply();
  assert.strictEqual(hello.code, 220, 'accueil');
  await s.cmd('EHLO boite-outils-gefec', [250], 'EHLO');
  if (o.user) {
    await s.cmd('AUTH LOGIN', [334], 'AUTH LOGIN');
    await s.cmd(b64text(o.user), [334], 'identifiant SMTP');
    await s.cmd(b64text(o.pass), [235], 'mot de passe SMTP');
  }
  await s.cmd(`MAIL FROM:<${bareAddr(o.from)}>`, [250], 'MAIL FROM');
  await s.cmd(`RCPT TO:<${o.to}>`, [250, 251], 'RCPT TO');
  await s.cmd('DATA', [354], 'DATA');
  for (const part of mimeParts(o)) await s.send(part);
  await s.send('\r\n.\r\n');
  const done = await s.reply();
  if (done.code !== 250) throw new Error(`message refusé — ${done.text}`);
  await s.cmd('QUIT', [221], 'QUIT');
  sock.destroy();
}

/* ── Faux serveur SMTP : réponses multi-lignes comprises ── */
function mockServer(onMessage) {
  return net.createServer((c) => {
    let buf = '', inData = false, data = '';
    const say = (t) => c.write(t + '\r\n');
    say('220 fake.smtp ESMTP ready');
    c.on('data', (d) => {
      buf += d.toString('utf8');
      for (;;) {
        if (inData) {
          const end = buf.indexOf('\r\n.\r\n');
          if (end < 0) { data += buf; buf = ''; return; }
          data += buf.slice(0, end);
          buf = buf.slice(end + 5);
          inData = false;
          onMessage(data);
          say('250 2.0.0 OK queued');
          continue;
        }
        const nl = buf.indexOf('\r\n');
        if (nl < 0) return;
        const line = buf.slice(0, nl); buf = buf.slice(nl + 2);
        const up = line.toUpperCase();
        if (up.startsWith('EHLO')) say('250-fake.smtp\r\n250-SIZE 35882577\r\n250-AUTH LOGIN PLAIN\r\n250 8BITMIME');
        else if (up === 'AUTH LOGIN') say('334 VXNlcm5hbWU6');
        else if (up.startsWith('MAIL FROM')) say('250 2.1.0 OK');
        else if (up.startsWith('RCPT TO')) say('250 2.1.5 OK');
        else if (up === 'DATA') { inData = true; say('354 Go ahead'); }
        else if (up === 'QUIT') { say('221 2.0.0 Bye'); c.end(); }
        else if (/^[A-Za-z0-9+/=]+$/.test(line)) {
          // réponses au défi AUTH : identifiant puis mot de passe
          say(mockServer.seenUser ? '235 2.7.0 Accepted' : '334 UGFzc3dvcmQ6');
          mockServer.seenUser = !mockServer.seenUser;
        } else say('250 OK');
      }
    });
  });
}

/* ── Le test ── */
(async () => {
  // un « PDF » de 5,2 Mo, contenu pseudo-aléatoire pour détecter toute altération
  const N = 5.22 * 1024 * 1024 | 0;
  const pdf = Buffer.alloc(N);
  for (let i = 0; i < N; i++) pdf[i] = (i * 31 + (i >> 8) * 17) & 255;
  const pdfB64 = toBase64(pdf);

  let received = null;
  const srv = mockServer((d) => { received = d; });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;

  const opts = {
    from: 'Boîte à outil GEFEC <remi.schaff@gmail.com>',
    to: 'remi.schaffhauser@but.fr',
    replyTo: 'remi.schaff@gmail.com',
    subject: 'Votre plan promo — Plan Promo TV + Plan Promo PEM — BUT CONFLANS',
    text: 'Bonjour,\n\nVoici la campagne promo — accents é à ç €.\n',
    html: '<div>Bonjour,<br>accents é à ç €</div>',
    user: 'remi.schaff@gmail.com', pass: 'motdepasseapp',
    attachments: [
      { filename: 'affiches-tv-but-conflans-2026-09-03.pdf', b64: pdfB64 },
      { filename: 'affiches-pem-but-conflans-2026-09-03.pdf', b64: toBase64(Buffer.from('petit PDF PEM')) },
    ],
  };

  const t0 = process.hrtime.bigint();
  await sendSmtp(opts, port);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  srv.close();

  assert.ok(received, 'aucun message reçu');
  console.log('message reçu :', (received.length / 1048576).toFixed(2), 'Mo — dialogue en', ms.toFixed(0), 'ms');

  // en-têtes
  assert.match(received, /^From: =\?UTF-8\?B\?[^\s]+\?= <remi\.schaff@gmail\.com>\r\n/, 'From');
  assert.match(received, /\r\nTo: <remi\.schaffhauser@but\.fr>\r\n/, 'To');
  assert.match(received, /\r\nSubject: =\?UTF-8\?B\?/, 'Subject encodé');
  assert.match(received, /\r\nReply-To: <remi\.schaff@gmail\.com>\r\n/, 'Reply-To');
  assert.match(received, /\r\nContent-Type: multipart\/mixed; boundary="(--gefec-mix-[0-9a-f-]+)"/, 'boundary mixed');

  // sujet : décodable et fidèle
  const sub = [...received.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].map(m => Buffer.from(m[1], 'base64').toString('utf8'));
  assert.ok(sub.join('').includes('Votre plan promo'), 'sujet décodé : ' + sub.join(''));

  // aucune ligne > 998 octets (limite SMTP), aucune ligne « . » isolée
  const lines = received.split('\r\n');
  const tooLong = lines.filter((l) => Buffer.byteLength(l) > 998);
  assert.strictEqual(tooLong.length, 0, tooLong.length + ' ligne(s) trop longue(s)');
  assert.strictEqual(lines.filter((l) => l === '.').length, 0, 'ligne « . » dans le corps');

  // le PDF ressort intact
  const mixB = received.match(/boundary="(--gefec-mix-[0-9a-f-]+)"/)[1];
  const blocs = received.split('--' + mixB);
  const bloc = blocs.find((b) => b.includes('affiches-tv-but-conflans'));
  assert.ok(bloc, 'pièce jointe TV absente');
  assert.match(bloc, /Content-Disposition: attachment; filename="affiches-tv-but-conflans-2026-09-03\.pdf"/, 'Content-Disposition');
  const corps = bloc.split('\r\n\r\n').slice(1).join('\r\n\r\n');
  const rendu = Buffer.from(corps.replace(/\r\n/g, ''), 'base64');
  assert.strictEqual(rendu.length, pdf.length, `taille ${rendu.length} vs ${pdf.length}`);
  assert.ok(rendu.equals(pdf), 'le PDF ne ressort pas identique');
  console.log('PDF de', (pdf.length / 1048576).toFixed(2), 'Mo restitué à l\'identique ✔');

  // découpage des lignes base64
  const b64lines = corps.split('\r\n').filter(Boolean);
  assert.ok(b64lines.slice(0, -1).every((l) => l.length === 76), 'lignes base64 non calibrées à 76');
  console.log(b64lines.length, 'lignes base64, la dernière de', b64lines[b64lines.length - 1].length, 'caractères ✔');

  // coût CPU de la mise en forme, isolé du réseau
  const t1 = process.hrtime.bigint();
  const parts = mimeParts(opts);
  const total = parts.reduce((n, p) => n + p.length, 0);
  const t2 = process.hrtime.bigint();
  console.log('mise en forme MIME :', (Number(t2 - t1) / 1e6).toFixed(0), 'ms pour',
              (total / 1048576).toFixed(2), 'Mo en', parts.length, 'écritures');
  console.log('\nTOUS LES CONTRÔLES PASSENT');
})().catch((e) => { console.error('ÉCHEC :', e.message); process.exit(1); });
