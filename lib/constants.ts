export const UNKNOWN_NODE_CODE = '-99'
export const AI_LABELING_BATCH_SIZE = parseInt(process.env.AI_LABELING_BATCH_SIZE || '100', 10)
export const AI_LEARNING_BATCH_SIZE = parseInt(process.env.AI_LEARNING_BATCH_SIZE || '100', 10)
export const AI_LEARNING_MIN_NEW_ANNOTATIONS = parseInt(process.env.AI_LEARNING_MIN_NEW_ANNOTATIONS || '500', 10)
export const AI_JOB_POLL_INTERVAL_MS = parseInt(process.env.AI_JOB_POLL_INTERVAL_MS || '5000', 10)
export const AI_JOB_POLL_TIMEOUT_MS = parseInt(process.env.AI_JOB_POLL_TIMEOUT_MS || '600000', 10)


