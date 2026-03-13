const BLOCK_PATTERNS = [
  /captcha\s+required/i,
  /complete\s+the\s+captcha/i,
  /solve\s+the\s+captcha/i,
  /enter\s+the\s+characters\s+you\s+see/i,
  /please\s+verify\s+you\s+are\s+a\s+human/i,
  /verify\s+you(?:'|’)re\s+human/i,
  /verify\s+you\s+are\s+human/i,
  /are\s+you\s+human/i,
  /bot\s+check/i,
  /security\s+check/i,
  /unusual\s+traffic/i,
  /press\s+and\s+hold/i,
  /challenge\s+required/i,
  // RedNote/Xiaohongshu commonly returns a login error page when the IP is flagged.
  /website-login\/error/i,
  /httpstatus=461/i,
  /verifytype=400/i,
  /api\/sns\/web\/v1\/login\/activate/i,
  /\u5b89\u5168\u9650\u5236/i, // "security restriction"
  /\u4eba\u673a\u9a8c\u8bc1/i, // "human verification"
  /\u8bf7\u5207\u6362\u53ef\u9760\u7f51\u7edc\u73af\u5883\u540e\u91cd\u8bd5/i // "switch to a trusted network and retry"
];

export function detectBlockOrCaptcha(input: string): boolean {
  const text = input.toLowerCase();
  return BLOCK_PATTERNS.some((pattern) => pattern.test(text));
}
