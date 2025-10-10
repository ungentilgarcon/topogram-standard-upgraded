import { Meteor } from 'meteor/meteor'
import { Comments } from './collections'

Meteor.methods({
  async addComment(topogramId, type, elementId, text, ownerId) {
    return await Comments.insertAsync({
      elementId,
      type,
      body: text,
      topogramId,
      createdAt: new Date(),
      owner: ownerId
    })
  }
})
