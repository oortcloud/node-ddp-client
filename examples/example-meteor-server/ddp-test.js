Posts = new Meteor.Collection('posts');

if (Meteor.isClient) {
  Template.posts.posts = function () {
    return Posts.find();
  };
}

if (Meteor.isServer) {
  Meteor.startup(function () {
    var postCount = Posts.find().count();
    if ( postCount < 10) {
      for ( ; postCount < 10;  postCount++) {
        Posts.insert({
          body : Random.secret()
        });
      }
    }
  });
}

Meteor.methods({
  deletePosts : function () {
    var cursor = Posts.find({}, { limit : 5 });
    cursor.forEach(function (post) {
      Posts.remove(post._id);
    });
  }
});
