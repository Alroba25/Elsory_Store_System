const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { middleware } = require("../middleware/middleware");
const { authorize } = require("../middleware/auth");
const router = express.Router();

const createLimiter = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, message },
  });

const registrationLimiter = createLimiter(
  60 * 60 * 1000,
  10,
  "Too many registration attempts. Please try again later.",
);
const loginLimiter = createLimiter(
  15 * 60 * 1000,
  10,
  "Too many login attempts. Please try again later.",
);
const passwordRecoveryLimiter = createLimiter(
  60 * 60 * 1000,
  5,
  "Too many password recovery attempts. Please try again later.",
);
const {
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
} = require("../controllers/user.controllers");
const {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  restoreProduct,
  deleteAllProducts,
  updateProductStock,
  getInactiveProducts,
  getProductByBarcode,
  getAccessoriesProducts,
  getMaintenanceProducts,
  getPhonesProducts,
} = require("../controllers/product.controllers");
const {
  addSupplier,
  getSuppliers,
  getSupplierById,
  deleteSupplier,
  updateSupplierStatus,
  updateSupplier,
} = require("../controllers/Supplier.controllers");
const {
  createPurchase,
  getPurchases,
  getPurchaseById,
  registerPurchasedPhone,
  registerPurchasedAccessory,
  cancelPurchase,
} = require("../controllers/purchase.controllers");
const {
  createSale,
  getSaleById,
  getSales,
} = require("../controllers/sales.controllers");
const {
  createReturn,
  getReturns,
  getReturnById,
  processRefund,
} = require("../controllers/returns.controllers");
const {
  getSalesReport,
  getPurchasesReport,
  getReturnsReport,
} = require("../controllers/reports.controllers");
const {
  openShift,
  getCurrentShift,
  createCashMovement,
  getShiftSummary,
  closeShift,
  getShiftHistory,
  getActiveShifts,
  getShiftById,
  getShiftReports,
} = require("../controllers/shift.controllers");

router.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Elsory Store API is running",
  });
});
router.get("/test", middleware, authorize("owner"), (req, res) => {
  res.status(200).json({
    success: true,
    message:
      "ًWelcome Owner, you are authenticated and authorized to access this route",
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
  });
});
// Users Routes
router.post("/register", registrationLimiter, register);
router.post("/login", loginLimiter, login);
router.post("/logout", logout);
router.get("/profile", middleware, getProfile);
router.post("/change-password", middleware, changePassword);
router.post("/forgot-password", passwordRecoveryLimiter, forgotPassword);
router.post("/reset-password", passwordRecoveryLimiter, resetPassword);
router.get("/users", middleware, authorize("owner"), getAllUsers);
router.get("/users/:id", middleware, authorize("owner"), getUserById);
router.patch("/users/:id/role", middleware, authorize("owner"), updateUserRole);
router.patch(
  "/users/:id/status",
  middleware,
  authorize("owner"),
  updateUserStatus,
);
router.patch("/users/me", middleware, updateUserProfile);
// Products Routes
router.post("/products", middleware, authorize("owner"), createProduct);
router.get("/products", middleware, authorize("owner"), getProducts);
router.get(
  "/products/accessories",
  middleware,
  authorize("accessories_seller"),
  getAccessoriesProducts,
);
router.get(
  "/products/maintenance",
  middleware,
  authorize("maintenance_seller"),
  getMaintenanceProducts,
);
router.get(
  "/products/phones",
  middleware,
  authorize("phone_seller"),
  getPhonesProducts,
);
router.get(
  "/products/inactive",
  middleware,
  authorize("owner"),
  getInactiveProducts,
);
router.get("/products/:id", middleware, authorize("owner"), getProductById);
router.put("/products/:id", middleware, authorize("owner"), updateProduct);
router.delete("/products/:id", middleware, authorize("owner"), deleteProduct);
router.patch(
  "/products/:id/restore",
  middleware,
  authorize("owner"),
  restoreProduct,
);
router.delete("/products", middleware, authorize("owner"), deleteAllProducts);
router.patch(
  "/products/:id/stock",
  middleware,
  authorize("owner"),
  updateProductStock,
);
router.get(
  "/products/barcode/:barcode",
  middleware,
  authorize("owner", "cashier"),
  getProductByBarcode,
);
// Suppliers Routes
router.post("/suppliers", middleware, authorize("owner"), addSupplier);
router.get("/suppliers", middleware, authorize("owner"), getSuppliers);
router.get("/suppliers/:id", middleware, authorize("owner"), getSupplierById);
router.patch("/suppliers/:id", middleware, authorize("owner"), updateSupplier);
router.patch(
  "/suppliers/status/:id",
  middleware,
  authorize("owner"),
  updateSupplierStatus,
);
router.delete("/suppliers/:id", middleware, authorize("owner"), deleteSupplier);
// Purchase Routes
router.post("/purchase", middleware, authorize("owner"), createPurchase);
router.get("/purchase", middleware, authorize("owner"), getPurchases);
router.get("/purchase/:id", middleware, authorize("owner"), getPurchaseById);
router.post(
  "/purchase/:purchaseId/items/:itemId/register-phone",
  middleware,
  authorize("owner"),
  registerPurchasedPhone,
);
router.post(
  "/purchase/:purchaseId/items/:itemId/register-accessory",
  middleware,
  authorize("owner"),
  registerPurchasedAccessory,
);
router.patch(
  "/purchase/:purchaseId/cancel",
  middleware,
  authorize("owner"),
  cancelPurchase,
);

// Sales Routes
router.post("/sales", middleware, authorize("cashier"), createSale);
router.get(
  "/sales/:id",
  middleware,
  authorize("owner", "cashier"),
  getSaleById,
);
router.get("/sales", middleware, authorize("owner", "cashier"), getSales);
// Return Routes
router.post("/return", middleware, authorize("cashier"), createReturn);
router.get("/return", middleware, authorize("cashier", "owner"), getReturns);
router.get(
  "/return/:id",
  middleware,
  authorize("cashier", "owner"),
  getReturnById,
);
router.patch(
  "/return/:id/refund",
  middleware,
  authorize("cashier"),
  processRefund,
);
//Reports Routes
router.get("/sales-reports", middleware, authorize("owner"), getSalesReport);
router.get(
  "/purchases-reports",
  middleware,
  authorize("owner"),
  getPurchasesReport,
);
router.get(
  "/returns-reports",
  middleware,
  authorize("owner"),
  getReturnsReport,
);
// Cashier: manage own shift
router.post("/shift/open", middleware, authorize("cashier"), openShift);
router.get("/shift/current", middleware, authorize("cashier"), getCurrentShift);
router.post(
  "/shift/movements",
  middleware,
  authorize("cashier"),
  createCashMovement,
);
router.get("/shift/summary", middleware, authorize("cashier"), getShiftSummary);
router.patch("/shift/close", middleware, authorize("cashier"), closeShift);

// Cashier sees own shifts, Owner sees all shifts
router.get(
  "/shift/history",
  middleware,
  authorize("cashier", "owner"),
  getShiftHistory,
);
// shift routes for owner
router.get("/shift/active", middleware, authorize("owner"), getActiveShifts);
router.get("/shift/reports", middleware, authorize("owner"), getShiftReports);
router.get("/shift/:id", middleware, authorize("owner"), getShiftById);
module.exports = router;
