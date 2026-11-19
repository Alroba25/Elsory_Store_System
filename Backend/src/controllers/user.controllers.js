const User = require("../models/user.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const {
  isPasswordResetEmailConfigured,
  sendPasswordResetEmail,
} = require("../utils/passwordResetEmail");
const { withOwnerMutationLock } = require("../utils/ownerMutationLock");

const isCrossSiteProduction = () =>
  process.env.NODE_ENV === "production" ||
  (process.env.CLIENT_URL || "").trim().startsWith("https://");

const getAuthCookieOptions = () => {
  const crossSite = isCrossSiteProduction();
  return {
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? "none" : "lax",
    path: "/",
  };
};

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      !name.trim() ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email",
      });
    }

    if (
      name.trim().length < 3 ||
      name.trim().length > 50 ||
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Name must be 3 to 50 characters and password must be 8 to 72 bytes",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    console.error("Register Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    }).select("+password +tokenVersion");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is disabled",
      });
    }

    const token = jwt.sign(
      { id: user._id, tokenVersion: user.tokenVersion ?? 0 },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      },
    );

    res.cookie("token", token, {
      ...getAuthCookieOptions(),
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const logout = (req, res) => {
  res.clearCookie("token", getAuthCookieOptions());
  return res.status(200).json({
    success: true,
    message: "Logout successful",
  });
};
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    return res.status(200).json({
      success: true,
      user: user,
    });
  } catch (error) {
    console.error("Get Profile Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      !currentPassword ||
      !newPassword
    ) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    if (newPassword.length < 8 || Buffer.byteLength(newPassword, "utf8") > 72) {
      return res.status(400).json({
        success: false,
        message: "New password must be 8 to 72 bytes",
      });
    }

    const user = await User.findById(req.user._id).select(
      "+password +tokenVersion",
    );

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);

    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from current password",
      });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    res.clearCookie("token", getAuthCookieOptions());

    return res.status(200).json({
      success: true,
      message: "Password changed successfully. Please login again.",
    });
  } catch (error) {
    console.error("Change Password Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    if (!isPasswordResetEmailConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Password recovery is temporarily unavailable",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+resetPasswordToken +resetPasswordExpires",
    );

    if (user) {
      const resetToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

      user.resetPasswordToken = hashedToken;
      user.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
      await user.save();

      try {
        await sendPasswordResetEmail({
          email: user.email,
          name: user.name,
          token: resetToken,
        });
      } catch (deliveryError) {
        await User.updateOne(
          { _id: user._id, resetPasswordToken: hashedToken },
          { $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 } },
        );
        console.error(
          "Password reset email delivery failed:",
          deliveryError.message,
        );
        return res.status(502).json({
          success: false,
          message:
            "تعذر إرسال رسالة استعادة كلمة المرور حالياً. يرجى التحقق من إعدادات البريد على السيرفر.",
          errorCode: deliveryError.message,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "If the account exists, reset instructions will be sent",
    });
  } catch (error) {
    console.error("Forgot Password Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (
      typeof token !== "string" ||
      !token ||
      typeof newPassword !== "string" ||
      !newPassword
    ) {
      return res.status(400).json({
        success: false,
        message: "Token and new password are required",
      });
    }

    if (newPassword.length < 8 || Buffer.byteLength(newPassword, "utf8") > 72) {
      return res.status(400).json({
        success: false,
        message: "Password must be 8 to 72 bytes",
      });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    }).select(
      "+password +tokenVersion +resetPasswordToken +resetPasswordExpires",
    );

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successfully. Please login again.",
    });
  } catch (error) {
    console.error("Reset Password Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    return res.status(200).json({
      success: true,
      users: users,
    });
  } catch (error) {
    console.error("Get All Users Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const getUserById = async (req, res) => {
  const { id } = req.params;
  try {
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const user = await User.findById(id).select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    return res.status(200).json({
      success: true,
      user: user,
    });
  } catch (error) {
    console.error("Get User By ID Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const allowedRoles = [
      "owner",
      "cashier",
      "accessories_seller",
      "phone_seller",
      "maintenance_seller",
      "general",
    ];

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be one of: " + allowedRoles.join(", "),
      });
    }

    if (new mongoose.Types.ObjectId(id).equals(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: "You cannot update your own role",
      });
    }

    const user = await withOwnerMutationLock(async () => {
      const target = await User.findById(id);
      if (!target) throw new Error("USER_NOT_FOUND");
      if (target.role === role) throw new Error("ROLE_UNCHANGED");

      if (target.role === "owner" && target.isActive && role !== "owner") {
        const activeOwners = await User.countDocuments({
          role: "owner",
          isActive: true,
        });
        if (activeOwners <= 1) throw new Error("LAST_ACTIVE_OWNER");
      }

      target.role = role;
      await target.save();
      return target;
    });

    return res.status(200).json({
      success: true,
      message: "User role updated successfully",
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    const errors = {
      USER_NOT_FOUND: [404, "User not found"],
      ROLE_UNCHANGED: [400, "User already has this role"],
      LAST_ACTIVE_OWNER: [400, "Cannot remove the last active owner"],
      OWNER_LOCK_TIMEOUT: [503, "Owner update is busy; please try again"],
    };

    if (errors[error.message] || error.code === "OWNER_LOCK_TIMEOUT") {
      const [status, message] =
        errors[error.message] || errors.OWNER_LOCK_TIMEOUT;
      return res.status(status).json({ success: false, message });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Update User Role Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be a boolean value",
      });
    }

    if (
      new mongoose.Types.ObjectId(id).equals(req.user._id) &&
      isActive === false
    ) {
      return res.status(400).json({
        success: false,
        message: "You cannot deactivate your own account",
      });
    }

    const user = await withOwnerMutationLock(async () => {
      const target = await User.findById(id);
      if (!target) throw new Error("USER_NOT_FOUND");
      if (target.isActive === isActive) throw new Error("STATUS_UNCHANGED");

      if (target.role === "owner" && target.isActive && !isActive) {
        const activeOwners = await User.countDocuments({
          role: "owner",
          isActive: true,
        });
        if (activeOwners <= 1) throw new Error("LAST_ACTIVE_OWNER");
      }

      target.isActive = isActive;
      await target.save();
      return target;
    });

    return res.status(200).json({
      success: true,
      message: "User status updated successfully",
      user: {
        id: user._id,
        name: user.name,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    const errors = {
      USER_NOT_FOUND: [404, "User not found"],
      STATUS_UNCHANGED: [
        400,
        "User is already " + (req.body.isActive ? "active" : "inactive"),
      ],
      LAST_ACTIVE_OWNER: [400, "Cannot deactivate the last active owner"],
      OWNER_LOCK_TIMEOUT: [503, "Owner update is busy; please try again"],
    };

    if (errors[error.message] || error.code === "OWNER_LOCK_TIMEOUT") {
      const [status, message] =
        errors[error.message] || errors.OWNER_LOCK_TIMEOUT;
      return res.status(status).json({ success: false, message });
    }

    console.error("Update User Status Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, email } = req.body;

    // 1. Check if at least one field was provided
    if (name === undefined && email === undefined) {
      return res.status(400).json({
        success: false,
        message: "Please provide name or email to update",
      });
    }

    // 2. Validate name
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 3) {
        return res.status(400).json({
          success: false,
          message: "Name must be at least 3 characters",
        });
      }
    }

    // 3. Validate email
    if (email !== undefined) {
      if (
        typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid email",
        });
      }
    }

    // 4. Find authenticated user
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // 5. Update name
    if (name !== undefined) {
      user.name = name.trim();
    }

    // 6. Update email
    if (email !== undefined) {
      user.email = email.trim().toLowerCase();
    }

    // 7. Save changes
    await user.save();

    // 8. Return updated user
    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Update User Profile Error:", error);

    // Duplicate email
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }

    // Mongoose validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
module.exports = {
  register,
  login,
  logout,
  getProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  getAllUsers,
  getUserById,
  updateUserRole,
  updateUserStatus,
  updateUserProfile,
};
