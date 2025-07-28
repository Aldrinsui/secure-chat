
import * as secp from '@noble/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import type { ECDSAKeys, Message, MessageFile, GroupMessage } from '../types';

// This is required by @noble/secp256k1 for RFC6979 deterministic nonces.
secp.etc.hmacSha256Sync = (key, ...messages) => hmac.apply(null, [sha256, key].concat(messages));

const textEncoder = new TextEncoder();

/**
 * Converts an ArrayBuffer to a hexadecimal string.
 * @param buffer The ArrayBuffer to convert.
 * @returns The hexadecimal string representation.
 */
const bufferToHex = (buffer: ArrayBuffer | Uint8Array): string => {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
};

/**
 * Converts a hexadecimal string to a Uint8Array.
 * @param hex The hexadecimal string to convert.
 * @returns The Uint8Array representation.
 */
const hexToBuffer = (hex: string): Uint8Array => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
};

/**
 * Generates an ECDSA secp256k1 key pair.
 * @returns A promise that resolves to an object containing the public and private keys.
 */
export const generateAndExportKeys = async (): Promise<ECDSAKeys> => {
    const privateKeyBytes = secp.utils.randomPrivateKey();
    const publicKeyBytes = secp.getPublicKey(privateKeyBytes, false); // false = uncompressed

    return {
        publicKey: bufferToHex(publicKeyBytes),
        privateKey: bufferToHex(privateKeyBytes),
        timestamp: new Date().toISOString()
    };
};

/**
 * Validates a key pair by deriving the public key from the private key.
 * @param keys The key object to validate.
 * @returns A promise that resolves to true if the keys are valid.
 */
export const validateKeys = async (keys: Partial<ECDSAKeys>): Promise<boolean> => {
    if (!keys.publicKey || !keys.privateKey || typeof keys.publicKey !== 'string' || typeof keys.privateKey !== 'string') {
        return false;
    }
    try {
        const privateKeyBytes = hexToBuffer(keys.privateKey);
        if (privateKeyBytes.length !== 32) return false; // secp256k1 private keys are 32 bytes

        const expectedPublicKeyBytes = secp.getPublicKey(privateKeyBytes, false);
        const expectedPublicKeyHex = bufferToHex(expectedPublicKeyBytes);
        
        return keys.publicKey === expectedPublicKeyHex;
    } catch (e) {
        console.error("Key validation failed:", e);
        return false;
    }
};


/**
 * Creates a canonical, stringified version of the message payload for signing.
 * This ensures that the signature is always generated for the same string representation.
 * @param content The message text content.
 * @param timestamp The message timestamp.
 * @param file The message file object, if any.
 * @param senderKey The sender's public key.
 * @param recipientKey The recipient's public key.
 * @returns A canonical JSON string.
 */
const getCanonicalDirectMessagePayload = (content: string, timestamp: number, file: MessageFile | undefined, senderKey: string, recipientKey: string): string => {
    const payload = {
        senderKey,
        recipientKey,
        content,
        timestamp,
        file: file ? {
            name: file.name,
            type: file.type,
            size: file.size,
        } : undefined,
    };
    return JSON.stringify(payload);
};


export const sign = async (messagePayload: Pick<Message, 'content' | 'timestamp' | 'file'>, privateKeyHex: string, senderKey: string, recipientKey: string): Promise<string> => {
    const canonicalPayload = getCanonicalDirectMessagePayload(messagePayload.content, messagePayload.timestamp, messagePayload.file, senderKey, recipientKey);
    const messageHash = await crypto.subtle.digest('SHA-256', textEncoder.encode(canonicalPayload));
    const signature = await secp.sign(new Uint8Array(messageHash), hexToBuffer(privateKeyHex));
    return bufferToHex(signature.toCompactRawBytes());
};

export const verify = async (message: Message, senderKey: string, recipientKey: string): Promise<boolean> => {
    try {
        const signature = secp.Signature.fromCompact(hexToBuffer(message.signature));
        const canonicalPayload = getCanonicalDirectMessagePayload(message.content, message.timestamp, message.file, senderKey, recipientKey);
        const messageHash = await crypto.subtle.digest('SHA-256', textEncoder.encode(canonicalPayload));

        return secp.verify(signature, new Uint8Array(messageHash), hexToBuffer(senderKey));
    } catch (e) {
        console.error("Verification failed:", e);
        return false;
    }
};

export const generateFingerprint = async (publicKeyHex: string): Promise<string> => {
    const publicKeyBuffer = textEncoder.encode(publicKeyHex);
    const hashBuffer = await crypto.subtle.digest('SHA-256', publicKeyBuffer);
    return bufferToHex(hashBuffer).substring(0, 16).toUpperCase();
};

const getCanonicalGroupMessagePayload = (message: Omit<GroupMessage, 'id' | 'signature'>): string => {
    const payload = {
        groupId: message.groupId,
        senderKey: message.senderKey,
        timestamp: message.timestamp,
        type: message.type,
        content: message.content,
        file: message.file ? {
            name: message.file.name,
            type: message.file.type,
            size: message.file.size,
        } : undefined,
        event: message.event ? {
            title: message.event.title,
            description: message.event.description,
            location: message.event.location,
            eventTime: message.event.eventTime,
        } : undefined,
        poll: message.poll ? {
            question: message.poll.question,
            options: message.poll.options,
        } : undefined,
        pollVote: message.pollVote ? {
            pollId: message.pollVote.pollId,
            optionIndex: message.pollVote.optionIndex,
        } : undefined,
        groupUpdate: message.groupUpdate ? {
            displayPicture: message.groupUpdate.displayPicture,
        } : undefined,
    };
    return JSON.stringify(payload);
};

export const signGroupMessage = async (messagePayload: Omit<GroupMessage, 'id' | 'signature'>, privateKeyHex: string): Promise<string> => {
    const canonicalPayload = getCanonicalGroupMessagePayload(messagePayload);
    const messageHash = await crypto.subtle.digest('SHA-256', textEncoder.encode(canonicalPayload));
    const signature = await secp.sign(new Uint8Array(messageHash), hexToBuffer(privateKeyHex));
    return bufferToHex(signature.toCompactRawBytes());
};

export const verifyGroupMessage = async (message: GroupMessage): Promise<boolean> => {
    try {
        const signature = secp.Signature.fromCompact(hexToBuffer(message.signature));
        const canonicalPayload = getCanonicalGroupMessagePayload(message);
        const messageHash = await crypto.subtle.digest('SHA-256', textEncoder.encode(canonicalPayload));

        return secp.verify(signature, new Uint8Array(messageHash), hexToBuffer(message.senderKey));
    } catch (e) {
        console.error("Group message verification failed:", e);
        return false;
    }
};


/**
 * Triggers a browser download for the given keys as a JSON file.
 * @param keys The ECDSA keys to download.
 */
export const downloadKeyFile = (keys: ECDSAKeys): void => {
    const keyData = {
        privateKey: keys.privateKey,
        publicKey: keys.publicKey,
        generated: keys.timestamp,
        curve: "secp256k1",
        warning: "CRITICAL: Keep this private key secure. Anyone with this key can impersonate you. We cannot recover it if lost."
    };

    const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `securechat-keys-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

/**
 * Triggers a browser download for a public key as a TXT file.
 * @param publicKey The public key string.
 */
export const downloadPublicKeyFile = (publicKey: string): void => {
    const blob = new Blob([publicKey], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `securechat-public-key.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
