export interface ECDSAKeys {
  publicKey: string;
  privateKey: string;
  timestamp: string;
}

export enum AlertType {
    WARNING = 'warning',
    CRITICAL = 'critical',
}

export interface Contact {
  id: number;
  publicKey: string;
  nickname: string;
  addedAt: string;
}

export interface MessageFile {
    name: string;
    type: string;
    size: number;
    data: string; // Base64 encoded file content
}

export interface Message {
  id: number;
  contactId: number;
  sender: 'you' | 'them';
  content: string; // Message text or file caption
  file?: MessageFile;
  signature: string; // Signature of the canonical message object
  timestamp: number;
  state: 'sent' | 'sending' | 'failed' | 'received';
}

export interface Group {
  id: string;
  name: string;
  memberKeys: string[];
  displayPicture?: string; // Optional Base64 encoded image
}


// --- New Rich Group Message Types ---

export interface GroupPoll {
    question: string;
    options: string[];
}

export interface GroupEvent {
    title: string;
    description: string;
    location?: string;
    eventTime: string;
}

export interface GroupPollVote {
    pollId: number; // Corresponds to the id of the poll message
    optionIndex: number;
}

export interface GroupUpdate {
    displayPicture: string;
}

export interface GroupMessage {
    id: number;
    groupId: string;
    senderKey: string;
    timestamp: number;
    signature: string;

    // New fields for rich content
    type: 'text' | 'file' | 'event' | 'poll' | 'pollVote' | 'group_update';
    content: string; // Used for text content or file caption
    file?: MessageFile;
    poll?: GroupPoll;
    event?: GroupEvent;
    pollVote?: GroupPollVote;
    groupUpdate?: GroupUpdate;
}