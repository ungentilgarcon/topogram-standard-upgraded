import { Mongo } from 'meteor/mongo'

export const Topograms = new Mongo.Collection('topograms')
export const Nodes = new Mongo.Collection('nodes')
export const Edges = new Mongo.Collection('edges')
export const Comments = new Mongo.Collection('comments')
export const Folders = new Mongo.Collection('folders')
export const AuditLogs = new Mongo.Collection('audit_logs')

// Deny client-side writes; use Methods on the server
;[Topograms, Nodes, Edges, Comments, Folders, AuditLogs].forEach((col) => {
  if (col && col.deny) {
    col.deny({ insert: () => true, update: () => true, remove: () => true })
  }
})

export default {
  Topograms,
  Nodes,
  Edges,
  Comments,
  Folders,
  AuditLogs
}
