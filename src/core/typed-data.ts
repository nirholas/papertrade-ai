import { concat, hashTypedData, keccak256, toBytes, type Address, type Hex } from 'viem';
import { PAPERTRADE } from './constants.js';

/** EIP-712 schemas accepted by the Papertrade relayer. */
export const TYPES = {
  RegisterSessionKey: [
    { name: 'user', type: 'address' },
    { name: 'key', type: 'address' },
    { name: 'expiry', type: 'uint64' },
    { name: 'feeAddress', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint64' },
  ],
  OpenPosition: [
    { name: 'user', type: 'address' },
    { name: 'instrumentId', type: 'uint32' },
    { name: 'isLong', type: 'bool' },
    { name: 'size', type: 'uint128' },
    { name: 'leverage', type: 'uint32' },
    { name: 'useDebt', type: 'bool' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint64' },
  ],
  Close: [
    { name: 'user', type: 'address' },
    { name: 'positionIds', type: 'uint256[]' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint64' },
  ],
  CancelIntent: [
    { name: 'user', type: 'address' },
    { name: 'intentId', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export type PrimaryType = keyof typeof TYPES;

export interface Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

/** The exchange domain name really is the literal string "String" on mainnet. */
export const EXCHANGE_DOMAIN: Domain = {
  name: 'String',
  version: '1',
  chainId: PAPERTRADE.chainId,
  verifyingContract: PAPERTRADE.contracts.exchange,
};

export const CANCEL_DOMAIN: Domain = {
  name: 'PaperTrade Intent Cancel',
  version: '2',
  chainId: PAPERTRADE.chainId,
  verifyingContract: PAPERTRADE.contracts.exchange,
};

export function domainFor(type: PrimaryType): Domain {
  return type === 'CancelIntent' ? CANCEL_DOMAIN : EXCHANGE_DOMAIN;
}

export type WireValue = string | boolean | string[];
export type WireMessage = Record<string, WireValue>;
export type SignedIntent = WireMessage & { v: string; r: Hex; s: Hex };

function toWire(type: string, value: unknown): WireValue {
  if (type.endsWith('[]')) {
    if (!Array.isArray(value)) throw new TypeError(`expected an array for ${type}`);
    return value.map((v) => toWire(type.slice(0, -2), v) as string);
  }
  if (type === 'bool') {
    if (typeof value !== 'boolean') throw new TypeError('expected a boolean');
    return value;
  }
  if (type.startsWith('uint')) {
    const n = BigInt(value as bigint | number | string);
    if (n < 0n) throw new RangeError(`${type} cannot be negative`);
    return n.toString();
  }
  const s = String(value);
  if (!/^0x[0-9a-fA-F]*$/.test(s)) throw new TypeError(`expected hex for ${type}`);
  return s.toLowerCase();
}

/** Every field in wire form: uints as decimal strings, addresses and bytes as lowercase hex. */
export function toWireMessage(type: PrimaryType, message: Record<string, unknown>): WireMessage {
  const out: WireMessage = {};
  for (const field of TYPES[type]) {
    if (!(field.name in message)) throw new TypeError(`${type}.${field.name} is required`);
    out[field.name] = toWire(field.type, message[field.name]);
  }
  return out;
}

function fromWire(type: PrimaryType, wire: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const field of TYPES[type]) {
    const v = wire[field.name];
    if (field.type.endsWith('[]')) out[field.name] = (v as string[]).map((x) => BigInt(x));
    else if (field.type.startsWith('uint')) out[field.name] = BigInt(v as string);
    else out[field.name] = v;
  }
  return out;
}

export function typedDataFor(type: PrimaryType, wire: Record<string, unknown>) {
  return {
    domain: domainFor(type),
    types: { [type]: TYPES[type] } as Record<string, readonly { name: string; type: string }[]>,
    primaryType: type,
    message: fromWire(type, wire),
  };
}

export function digestOf(type: PrimaryType, wire: Record<string, unknown>): Hex {
  return hashTypedData(typedDataFor(type, wire) as Parameters<typeof hashTypedData>[0]);
}

const INTENT_ID_PREFIX_HASH = keccak256(toBytes('papertrade:intent-id:v2'));

/** intentId = keccak256(keccak256("papertrade:intent-id:v2") ++ digest ++ signer). */
export function intentIdOf(digest: Hex, signer: Address): Hex {
  return keccak256(concat([INTENT_ID_PREFIX_HASH, digest, signer.toLowerCase() as Hex]));
}

export function splitSignature(sig: Hex): { v: string; r: Hex; s: Hex } {
  const hex = sig.slice(2);
  if (hex.length !== 130) throw new Error('The wallet returned a malformed signature.');
  const raw = parseInt(hex.slice(128, 130), 16);
  const yParity = raw >= 27 ? raw - 27 : raw;
  if (yParity !== 0 && yParity !== 1) throw new Error('The wallet returned a malformed signature.');
  return { v: String(27 + yParity), r: `0x${hex.slice(0, 64).toLowerCase()}` as Hex, s: `0x${hex.slice(64, 128).toLowerCase()}` as Hex };
}

export function joinSignature(signed: { v: string; r: Hex; s: Hex }): Hex {
  const v = Number(signed.v);
  return `0x${signed.r.slice(2)}${signed.s.slice(2)}${v.toString(16).padStart(2, '0')}` as Hex;
}

export interface TypedDataSigner {
  address: Address;
  signTypedData(args: ReturnType<typeof typedDataFor>): Promise<Hex>;
}

export async function signIntent(signer: TypedDataSigner, type: PrimaryType, message: Record<string, unknown>) {
  const wire = toWireMessage(type, message);
  const signature = await signer.signTypedData(typedDataFor(type, wire));
  const signed: SignedIntent = { ...wire, ...splitSignature(signature) };
  const intentId = intentIdOf(digestOf(type, wire), signer.address);
  return { signed, intentId };
}

/**
 * Fresh nonce matching the official client's scheme: a random non-zero 24-bit word index
 * times 256, plus a random bit within that word. Uniqueness is what the relayer enforces.
 */
export function freshNonce(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const word = ((bytes[0] << 16) | (bytes[1] << 8) | bytes[2]) || 1;
  return BigInt(word) * 256n + BigInt(bytes[3]);
}

export function deadlineIn(seconds: number, nowMs = Date.now()): bigint {
  return BigInt(Math.floor(nowMs / 1000) + seconds);
}
