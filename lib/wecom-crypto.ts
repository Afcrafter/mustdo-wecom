import crypto from "crypto";

const BLOCK = 32;

function pkcs7Unpad(buf: Buffer): Buffer {
  const n = buf[buf.length - 1];
  if (n < 1 || n > BLOCK) throw new Error("pkcs7");
  return buf.subarray(0, buf.length - n);
}

export function sign(token: string, timestamp: string, nonce: string, encrypt: string): string {
  const raw = [token, timestamp, nonce, encrypt].sort().join("");
  return crypto.createHash("sha1").update(raw).digest("hex");
}

export function decryptEcho(echostr: string, encodingAESKey: string, corpId: string): string {
  const key = Buffer.from(encodingAESKey + "=", "base64");
  if (key.length !== 32) throw new Error("EncodingAESKey 长度不对，应为 43 位");
  const iv = key.subarray(0, 16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(false);
  const decoded = pkcs7Unpad(
    Buffer.concat([decipher.update(Buffer.from(echostr, "base64")), decipher.final()])
  );
  const msgLen = decoded.readUInt32BE(16);
  const msg = decoded.subarray(20, 20 + msgLen).toString("utf8");
  const receiveId = decoded.subarray(20 + msgLen).toString("utf8");
  if (corpId && receiveId && receiveId !== corpId) {
    throw new Error("corpid mismatch");
  }
  return msg;
}

export function verifyUrl(params: {
  msg_signature?: string;
  timestamp?: string;
  nonce?: string;
  echostr?: string;
  token: string;
  encodingAESKey: string;
  corpId: string;
}): string {
  const { msg_signature, timestamp, nonce, echostr, token, encodingAESKey, corpId } = params;
  if (!msg_signature || !timestamp || !nonce || !echostr) {
    throw new Error("missing query");
  }
  const expected = sign(token, timestamp, nonce, echostr);
  if (expected !== msg_signature) {
    throw new Error("signature");
  }
  return decryptEcho(echostr, encodingAESKey, corpId);
}
