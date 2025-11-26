export const UNKNOWN_NODE_CODES: Record<number, string> = {
  1: '-9',
  2: '-99',
  3: '-999',
  4: '-9999',
  5: '-99999'
}

export const UNKNOWN_NODE_CODE_SET = new Set(Object.values(UNKNOWN_NODE_CODES))

export const getUnknownCodeForLevel = (level: number): string => {
  if (level in UNKNOWN_NODE_CODES) {
    return UNKNOWN_NODE_CODES[level as keyof typeof UNKNOWN_NODE_CODES]
  }
  // Default to deepest level code if an unexpected level is provided
  return UNKNOWN_NODE_CODES[5]
}

export const isUnknownNodeCode = (code: string | null | undefined): boolean => {
  if (code === null || code === undefined) return false
  return UNKNOWN_NODE_CODE_SET.has(code)
}
export const AI_LABELING_BATCH_SIZE = parseInt(process.env.AI_LABELING_BATCH_SIZE || '100', 10)
export const AI_LEARNING_BATCH_SIZE = parseInt(process.env.AI_LEARNING_BATCH_SIZE || '100', 10)
export const AI_LEARNING_MIN_NEW_ANNOTATIONS = parseInt(process.env.AI_LEARNING_MIN_NEW_ANNOTATIONS || '500', 10)
export const AI_JOB_POLL_INTERVAL_MS = parseInt(process.env.AI_JOB_POLL_INTERVAL_MS || '5000', 10)
export const AI_JOB_POLL_TIMEOUT_MS = parseInt(process.env.AI_JOB_POLL_TIMEOUT_MS || '600000', 10)


