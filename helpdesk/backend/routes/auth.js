const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();


// ============================
// SIGNUP
// ============================
router.post("/signup", async (req, res) => {
  const { name, employee_id, email, password, role } = req.body;

  if (!name || !employee_id || !email || !password || !role) {
    return res.status(400).json({ message: "All fields required" });
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = await User.create({
      name,
      employee_id,
      email,
      password: hashedPassword,
      role
    });

    res.status(201).json({
      message: "User registered successfully"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


// ============================
// LOGIN
// ============================
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "All fields required" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || "secretkey",
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || "Employee",
        employee_id: user.employee_id || "",
        mobile_number: user.mobile_number || "",
        batch: user.batch || "",
        date_of_birth: user.date_of_birth || "",
        home_address: user.home_address || "",
        nationality: user.nationality || "",
        id_proof_number: user.id_proof_number || ""
      }
    });

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


// ============================
// RESET PASSWORD
// ============================
router.post("/reset-password", async (req, res) => {
  const { email, employee_id, newPassword } = req.body;

  if (!email || !employee_id || !newPassword) {
    return res.status(400).json({ message: "Email, Employee ID, and new password are required" });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters" });
  }

  try {
    // Find user by email AND employee_id for security
    const user = await User.findOne({ email, employee_id });
    if (!user) {
      return res.status(404).json({ message: "No account found with that email and employee ID combination" });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update the password
    user.password = hashedPassword;
    await user.save();

    res.json({ message: "Password reset successfully. You can now login with your new password." });

  } catch (err) {
    console.error("Password reset error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ============================
// UPDATE PROFILE
// ============================
router.put("/profile/:id", async (req, res) => {
  const { id } = req.params;
  const { 
    mobile_number, 
    batch, 
    date_of_birth, 
    home_address, 
    nationality, 
    id_proof_number 
  } = req.body;

  try {
    const updateData = {};
    if (mobile_number !== undefined) updateData.mobile_number = mobile_number;
    if (batch !== undefined) updateData.batch = batch;
    if (date_of_birth !== undefined) updateData.date_of_birth = date_of_birth;
    if (home_address !== undefined) updateData.home_address = home_address;
    if (nationality !== undefined) updateData.nationality = nationality;
    if (id_proof_number !== undefined) updateData.id_proof_number = id_proof_number;

    // Use findByIdAndUpdate but enforce validators for the updated fields
    const user = await User.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true } // Returns the modified document
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        employee_id: user.employee_id,
        mobile_number: user.mobile_number,
        batch: user.batch,
        date_of_birth: user.date_of_birth,
        home_address: user.home_address,
        nationality: user.nationality,
        id_proof_number: user.id_proof_number
      }
    });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ message: "Server error", error: err.message, stack: err.stack });
  }
});

module.exports = router;