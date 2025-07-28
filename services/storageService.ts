import type { Contact, Message, Group, GroupMessage } from '../types';

const getPrefixedKey = (publicKey: string, key: string): string => {
    // Use a unique namespace for each user based on their public key.
    return `secureChat::${publicKey}::${key}`;
};

// --- Contacts ---
export const loadContacts = (publicKey: string): Contact[] => {
    try {
        const key = getPrefixedKey(publicKey, 'contacts');
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        console.error("Failed to load contacts:", e);
        return [];
    }
};

export const saveContacts = (publicKey: string, contacts: Contact[]): void => {
    const key = getPrefixedKey(publicKey, 'contacts');
    localStorage.setItem(key, JSON.stringify(contacts));
};

// --- Direct Messages ---
export const loadMessages = (publicKey: string, contactId: number): Message[] => {
    try {
        const key = getPrefixedKey(publicKey, `messages_${contactId}`);
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        console.error("Failed to load messages:", e);
        return [];
    }
};

export const saveMessages = (publicKey: string, contactId: number, messages: Message[]): void => {
    const key = getPrefixedKey(publicKey, `messages_${contactId}`);
    localStorage.setItem(key, JSON.stringify(messages));
};

export const removeMessagesForContact = (publicKey: string, contactId: number): void => {
    const key = getPrefixedKey(publicKey, `messages_${contactId}`);
    localStorage.removeItem(key);
};

// --- Groups ---
export const loadGroups = (publicKey: string): Group[] => {
    try {
        const key = getPrefixedKey(publicKey, 'groups');
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        console.error("Failed to load groups:", e);
        return [];
    }
};

export const saveGroups = (publicKey: string, groups: Group[]): void => {
    const key = getPrefixedKey(publicKey, 'groups');
    localStorage.setItem(key, JSON.stringify(groups));
};

// --- Group Messages ---
export const loadGroupMessages = (publicKey: string, groupId: string): GroupMessage[] => {
    try {
        const key = getPrefixedKey(publicKey, `group_messages_${groupId}`);
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        console.error("Failed to load group messages:", e);
        return [];
    }
};

export const saveGroupMessages = (publicKey: string, groupId: string, messages: GroupMessage[]): void => {
    const key = getPrefixedKey(publicKey, `group_messages_${groupId}`);
    localStorage.setItem(key, JSON.stringify(messages));
};


// --- Data Wipe ---
export const wipeUserData = (publicKey: string): void => {
    const prefix = `secureChat::${publicKey}::`;
    const keysToRemove: string[] = [];
    // Create a list of keys to remove first to avoid issues with modifying storage while iterating
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
};
