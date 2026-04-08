// Minimal SQS event types used by the feedback handler
// Inline types — no @types/aws-lambda dependency

// --- SQS Event Types ---

export interface SqsMessageAttribute {
  stringValue?: string;
  binaryValue?: string;
  dataType: string;
}

export interface SqsRecord {
  messageId: string;
  receiptHandle: string;
  body: string;
  attributes: Record<string, string>;
  messageAttributes: Record<string, SqsMessageAttribute>;
  md5OfBody: string;
  eventSource: string;
  eventSourceARN: string;
  awsRegion: string;
}

export interface SqsEvent {
  Records: SqsRecord[];
}

export interface SqsBatchResponse {
  batchItemFailures: Array<{ itemIdentifier: string }>;
}

// --- Zod Schemas (re-exported from @qlibin/tg-assistant-contracts) ---

export {
  SCHEMA_VERSION,
  TaskTypeSchema,
  OrderMessageSchema,
  ResultMessageSchema,
  StatusSchema,
  PrioritySchema,
  FollowUpActionSchema,
} from '@qlibin/tg-assistant-contracts';
export type {
  TaskType,
  OrderMessage,
  ResultMessage,
  Status,
  Priority,
  FollowUpAction,
} from '@qlibin/tg-assistant-contracts';
