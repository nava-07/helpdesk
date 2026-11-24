const mongoose = require("mongoose");

const TicketHistorySchema = new mongoose.Schema({
  action: String,
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  userName: String,
  details: String,
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const TicketSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true },
    priority: { type: String, enum: ["low", "medium", "high", "critical"], default: "medium" },
    description: { type: String, required: true },
    status: { 
      type: String, 
      enum: ["Pending", "Open", "In Progress", "Resolved", "Completed", "Closed"], 
      default: "Pending" 
    },
    createdBy: { type: String, default: "User" },
    
    // Enterprise Extensions
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    employeeName: { type: String },
    employeeEmpId: { type: String },
    department: { type: String },
    contact: { type: String },
    
    assignedTeam: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
    assignedMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    
    history: [TicketHistorySchema]
  },
  {
    timestamps: true
  }
);

// High Performance Indexing
TicketSchema.index({ status: 1 });
TicketSchema.index({ employeeId: 1 });
TicketSchema.index({ assignedTeam: 1 });

// Note: In a production shareded environment, you would define the hashed shard key for tickets
// e.g. sh.shardCollection("helpdesk.tickets", { _id: "hashed" })

module.exports = mongoose.model("Ticket", TicketSchema);
