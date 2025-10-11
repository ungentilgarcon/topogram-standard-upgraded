import { Mongo } from 'meteor/mongo'

export const Jobs = new Mongo.Collection('jobs')

// Simple helper to create or update job docs
export const createJob = async ({ userId, type, payload }) => {
  const job = { userId, type, payload, status: 'queued', processed: 0, total: 0, inserted: 0, updated: 0, skipped: 0, errors: [], createdAt: new Date() }
  return Jobs.insertAsync(job)
}
