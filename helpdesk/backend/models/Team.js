const mongoose = require("mongoose");

const TeamSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    default: ""
  },
  lead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }],
  categoryFocus: [{
    type: String 
  }]
}, { timestamps: true });

module.exports = mongoose.model("Team", TeamSchema);
