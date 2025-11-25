import { processJobInBackground, recoverStuckJobs as recoverStuckJobsInternal } from './bulk-finder-processor'

class JobQueue {
  private static instance: JobQueue
  private processingInterval: NodeJS.Timeout | null = null

  private constructor() {
    this.startProcessing()
  }

  public static getInstance(): JobQueue {
    if (!JobQueue.instance) JobQueue.instance = new JobQueue()
    return JobQueue.instance
  }

  private startProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
    }
    // No-op: backend handles queueing; keep a lightweight heartbeat to avoid unused timers
    this.processingInterval = setInterval(() => {}, 60000)
  }

  public async addJob(jobId: string) {
    try {
      await processJobInBackground(jobId)
      return true
    } catch (error) {
      console.error('Queue addJob error:', error)
      return false
    }
  }

  public async recoverStuckJobs() {
    try {
      await recoverStuckJobsInternal()
    } catch (error) {
      console.error('Queue recoverStuckJobs error:', error)
    }
  }

  public stop() {
    if (this.processingInterval) clearInterval(this.processingInterval)
    this.processingInterval = null
  }

  public async getQueueStatus() {
    return { pending: 0, processing: 0, isActive: this.processingInterval !== null }
  }
}

let jobQueue: JobQueue | null = null
export function getJobQueue(): JobQueue {
  if (!jobQueue) jobQueue = JobQueue.getInstance()
  return jobQueue
}

export default JobQueue
