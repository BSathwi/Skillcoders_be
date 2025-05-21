const express = require("express");
const razorpayRoute = express.Router();
const razorpay = require("../RazorPay/razor");
const crypto = require("crypto"); 
const db = require("../DbConnection/db"); 
const { verifyToken } = require("../middleware/authMiddle"); 


razorpayRoute.post("/create-order", verifyToken, async (req, res) => {
    try {
        const user_id = req.user.id; 
        const { course_id, amount } = req.body;

        if (!course_id || !amount) {
            return res.status(400).json({ message: "Course ID and amount are required" });
        }

        const { rows } = await db.query(
            "SELECT * FROM registered_courses WHERE user_id = $1 AND course_id = $2",
            [user_id, course_id]
        );

        if (rows.length > 0) {
            return res.status(400).json({ message: "Already registered for this course" });
        }

        const options = {
            amount: amount * 100,
            currency: "INR",
            receipt: `order_rcptid_${user_id}_${course_id}`,
            payment_capture: 1,
        };

        const order = await razorpay.orders.create(options);

        res.json({
            success: true,
            message: "Order created successfully",
            orderId: order.id,
            key: process.env.RAZORPAY_KEY_ID,
            amount:amount
        });
    } catch (error) {
        console.error("Error creating order:", error);
        res.status(500).json({ message: "Error creating order", error });
    }
});

razorpayRoute.post("/verify-payment", verifyToken, async (req, res) => {
  try {
      const user_id = req.user.id;
      const { course_id, order_id, payment_id, signature, amount } = req.body;
      
      if (!course_id || !order_id || !payment_id || !signature || !amount) {
          return res.status(400).json({ message: "All fields are required" });
      }

      const generated_signature = crypto
          .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
          .update(order_id + "|" + payment_id)
          .digest("hex");

      if (generated_signature !== signature) {
          return res.status(400).json({ message: "Payment verification failed" });
      }

      const client = await db.connect();
      try {
          await client.query('BEGIN');

          // Insert payment record
          await client.query(
              "INSERT INTO payments (user_id, course_id, transaction_id, amount, status) VALUES ($1, $2, $3, $4, $5)",
              [user_id, course_id, payment_id, amount, "success"]
          );

          await client.query(
              "INSERT INTO registered_courses (user_id, course_id) VALUES ($1, $2)",
              [user_id, course_id]
          );

          await client.query(
              "UPDATE courses SET no_of_users_registered = no_of_users_registered + 1 WHERE id = $1",
              [course_id]
          );

          await client.query('COMMIT');
          client.release();

          res.json({
              success: true,
              message: "Payment verified and course registered successfully",
          });
      } catch (error) {
          await client.query('ROLLBACK');
          client.release();
          throw error;
      }
  } catch (error) {
      console.error("Error verifying payment:", error);
      res.status(500).json({ message: "Error verifying payment", error });
  }
});


module.exports = razorpayRoute;
