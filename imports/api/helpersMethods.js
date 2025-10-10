import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'

Meteor.methods({
  async updateField(collectionName, _id, field, value) {
    if (collectionName && _id && field) {
      const Collection = Mongo.Collection.get(collectionName)
      if (!Collection) throw new Meteor.Error('helpers.collection-not-found')
      const toUpdate = {}
      toUpdate[field] = value
      return await Collection.updateAsync({ _id }, { $set: toUpdate })
    }
    throw new Meteor.Error('helpers.invalid-args')
  }
})
