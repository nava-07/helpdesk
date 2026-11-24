const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    employee_id: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true,
      unique: true
    },
    password: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ["Employee", "Admin", "IT Engineer", "Support"],
      default: "Employee"
    },
    mobile_number: { type: String, default: "" },
    batch: { type: String, default: "" },
    date_of_birth: { type: String, default: "" },
    home_address: { type: String, default: "" },
    nationality: { type: String, default: "" },
    id_proof_number: { type: String, default: "" }
  },
  { timestamps: true }
);

// Method to check if profile is complete before allowing ticket creation
UserSchema.methods.hasCompleteProfile = function() {
  return (
    this.mobile_number && 
    this.mobile_number.trim() !== "" &&
    this.batch && 
    this.batch.trim() !== "" &&
    this.date_of_birth && 
    this.date_of_birth.trim() !== "" &&
    this.home_address && 
    this.home_address.trim() !== "" &&
    this.id_proof_number && 
    this.id_proof_number.trim() !== ""
  );
};

module.exports = mongoose.model("User", UserSchema);
