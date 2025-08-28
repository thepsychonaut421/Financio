import pino from 'pino';

export interface LogFields {
  workflow: string;
  docType: string;
  docId?: string;
  idemKey?: string;
  action: string;
  duration_ms?: number;
}

export const logger = pino({
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function logInfo(fields: LogFields, msg: string) {
  logger.info(fields, msg);
}

export function logError(fields: LogFields, err: any, msg?: string) {
  logger.error({ ...fields, err }, msg);
}
