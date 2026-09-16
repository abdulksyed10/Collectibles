export function scanFile(path, content) {
  const findings = [];
  const normalized = path.replaceAll('\\', '/');
  if (/(^|\/)\.env(?:\.|$)/.test(normalized) && !normalized.endsWith('/.env.example') && normalized !== '.env.example') findings.push('environment file');
  if (/(^|\/)(secrets|credentials)\/|\.(pem|key|p12|p8|jks|keystore|mobileprovision)$|(^|\/)service[-_]?account[^/]*\.json$/i.test(normalized)) findings.push('credential file');
  if (content.includes('\0')) return findings;
  const rules = [
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['Supabase server key', /\bsb_secret_[A-Za-z0-9_-]{20,}/],
    ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],
    ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
    ['database password URL', /postgres(?:ql)?:\/\/[^\s:'"<>]+:[^\s@'"<>]+@/],
    ['assigned server credential', /(?:R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN|MEDIA_DATABASE_URL)\s*[:=]\s*['"]?[A-Za-z0-9_+\/-]{24,}/],
  ];
  for (const [label, pattern] of rules) if (pattern.test(content)) findings.push(label);
  for (const match of content.matchAll(/\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    try { if (JSON.parse(Buffer.from(match[1], 'base64url').toString()).role === 'service_role') findings.push('Supabase service-role JWT'); } catch { /* Not a parseable JWT. */ }
  }
  return [...new Set(findings)];
}
