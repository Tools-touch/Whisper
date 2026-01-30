import nacl from "tweetnacl";
import * as naclUtil from "tweetnacl-util";

export function encodeBase64(bytes: Uint8Array): string {
  return naclUtil.encodeBase64(bytes);
}

export function decodeBase64(value: string): Uint8Array {
  return naclUtil.decodeBase64(value);
}

export function generateKeypair() {
  return nacl.box.keyPair();
}

export function keypairFromSecretKey(secretKey: Uint8Array) {
  return nacl.box.keyPair.fromSecretKey(secretKey);
}

export function encryptMessage(plaintext: string, recipientEncPk: Uint8Array) {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ephemeral = nacl.box.keyPair();
  const boxed = nacl.box(
    naclUtil.decodeUTF8(plaintext),
    nonce,
    recipientEncPk,
    ephemeral.secretKey
  );
  return {
    ciphertext: naclUtil.encodeBase64(boxed),
    nonce: naclUtil.encodeBase64(nonce),
    epk: naclUtil.encodeBase64(ephemeral.publicKey),
  };
}

export function decryptMessage(
  ciphertextB64: string,
  nonceB64: string,
  epkB64: string,
  recipientSecretKey: Uint8Array
) {
  const ciphertext = naclUtil.decodeBase64(ciphertextB64);
  const nonce = naclUtil.decodeBase64(nonceB64);
  const epk = naclUtil.decodeBase64(epkB64);
  const opened = nacl.box.open(ciphertext, nonce, epk, recipientSecretKey);
  if (!opened) {
    return null;
  }
  return naclUtil.encodeUTF8(opened);
}
