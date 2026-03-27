// Minimal SQS event types used by the feedback handler
// Inline types — no @types/aws-lambda dependency

import { z } from 'zod';

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

// --- Zod Schemas ---

export const TaskTypeSchema = z.enum([
  'playwright-scraping',
  'url-monitoring',
  'web-automation',
  'perplexity-summary',
  'content-analysis',
  'text-processing',
  'scheduled-linkedin',
  'scheduled-german',
  'system-health',
]);

export type TaskType = z.infer<typeof TaskTypeSchema>;

export const OrderMessageSchema = z.object({
  orderId: z.string(),
  taskType: TaskTypeSchema,
  payload: z.object({
    url: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
    configuration: z.record(z.string(), z.unknown()).optional(),
    timeout: z.number().optional(),
    retryPolicy: z
      .object({
        maxRetries: z.number().optional(),
        backoffMultiplier: z.number().optional(),
      })
      .optional(),
  }),
  userId: z.string(),
  timestamp: z.string(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  retryCount: z.number().optional(),
  deduplicationId: z.string().optional(),
  correlationId: z.string().optional(),
  schemaVersion: z.literal('1.0.0').optional(),
});

export type OrderMessage = z.infer<typeof OrderMessageSchema>;

export const ResultMessageSchema = z.object({
  orderId: z.string(),
  status: z.enum(['success', 'failure', 'partial']),
  userId: z.string(),
  chatId: z.number(),
  timestamp: z.string(),
  correlationId: z.string().optional(),
  result: z
    .object({
      summary: z.string().optional(),
      data: z.unknown().optional(),
    })
    .optional(),
  error: z
    .object({
      message: z.string(),
      code: z.string().optional(),
    })
    .optional(),
  schemaVersion: z.literal('1.0.0').optional(),
});

export type ResultMessage = z.infer<typeof ResultMessageSchema>;
