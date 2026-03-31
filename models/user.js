const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  googleId:     { type: String, sparse: true, unique: true, default: null },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  name:         { type: String, required: true, trim: true },
  avatarUrl:    { type: String, default: "" },
  passwordHash: { type: String, default: null },
  createdAt:    { type: Date, default: Date.now },
});

// Never expose passwordHash in JSON responses
userSchema.methods.toSafeObject = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    avatarUrl: this.avatarUrl,
  };
};

module.exports = mongoose.model("User", userSchema);
