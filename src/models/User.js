const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  googleId:     { type: String, sparse: true, unique: true },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  name:         { type: String, required: true, trim: true },
  avatarUrl:    { type: String, default: "" },
  passwordHash: { type: String, default: null },
  llmConfig: {
    provider:        { type: String, default: "groq" },
    model:           { type: String, default: "" },
    encryptedApiKey: { type: String, default: "" },
  },
  researchConfig: {
    encryptedNcbiKey: { type: String, default: "" },
  },
  preferences: {
    theme:      { type: String, default: "light" },
    fontSize:   { type: Number, default: 14 },
    language:   { type: String, default: "English" },
    strictMode: { type: Boolean, default: false },
  },
  createdAt:    { type: Date, default: Date.now },
});

// Never expose passwordHash in JSON responses
userSchema.methods.toSafeObject = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    avatarUrl: this.avatarUrl,
    preferences: this.preferences ? {
      theme: this.preferences.theme,
      fontSize: this.preferences.fontSize,
      language: this.preferences.language,
      strictMode: this.preferences.strictMode,
    } : undefined,
  };
};

module.exports = mongoose.model("User", userSchema);
