const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../DbConnection/db");
const { verifyToken, verifyAdmin } = require("../middleware/authMiddle");
const authRouter = express.Router();
const nodemailer = require("nodemailer");

authRouter.post("/register", async (req, res) => {
    const { mail_id, name, password, phone_number } = req.body;  

    if (!mail_id || !name || !password || !phone_number) {  
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        const [existingUser] = await pool.query("SELECT * FROM users WHERE mail_id = ?", [mail_id]);
        if (existingUser.length > 0) {
            return res.status(400).json({ message: "Email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.query(
            "INSERT INTO users (name, mail_id, password, phone_number, admin, active_status) VALUES (?, ?, ?, ?, ?, ?)", 
            [name, mail_id, hashedPassword, phone_number, false, 'Inactive']
        );

        res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


authRouter.post("/login", async (req, res) => {
    const { mail_id, password } = req.body;

    if (!mail_id || !password) {
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        const [user] = await pool.query("SELECT * FROM users WHERE mail_id = ?", [mail_id]);

        if (user.length === 0) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const foundUser = user[0];

        const isMatch = await bcrypt.compare(password, foundUser.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        await pool.query("UPDATE users SET active_at = NOW(), active_status = 'Active' WHERE id = ?", [foundUser.id]);

        const token = jwt.sign(
            {
                id: foundUser.id,
                name: foundUser.name,
                mail_id: foundUser.mail_id,
                admin: foundUser.admin, 
            },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.json({ message: "Login successful", token, username: foundUser.name,admin: foundUser.admin });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

authRouter.post("/logout", verifyToken || verifyAdmin, async (req, res) => {
    try {
        const userId = req.user.id;
        await pool.query("UPDATE users SET active_status = 'Inactive' WHERE id = ?", [userId]);
        res.json({ message: "Logout successful" });
    } catch (error) {
        console.error("Logout Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

authRouter.get("/profile", verifyToken || verifyAdmin, async (req, res) => {
    try {
        const userId = req.user.id;
        const connection = await pool.getConnection();

        const [user] = await connection.query(
            `SELECT u.id, u.name, u.mail_id, u.phone_number, u.user_image, u.active_status,
                    COALESCE(SUM(ci.course_id IS NOT NULL), 0) AS total_cart_count
             FROM users u
             LEFT JOIN cart c ON u.id = c.user_id
             LEFT JOIN cart_items ci ON c.id = ci.cart_id
             WHERE u.id = ?
             GROUP BY u.id`,
            [userId]
        );

        connection.release();

        if (user.length === 0) {
            return res.status(404).json({ message: "User not found!" });
        }

        res.json(user[0]);
    } catch (err) {
        console.error("Error fetching profile:", err);
        res.status(500).json({ message: "Server Error" });
    }
});

authRouter.get("/dashboard",verifyAdmin, async (req, res) => {
    try {
        const [[{ total_courses }]] = await pool.query("SELECT COUNT(*) AS total_courses FROM courses");
        const [[{ total_registrations }]] = await pool.query("SELECT COUNT(*) AS total_registrations FROM registered_courses");
        const [[{ active_users }]] = await pool.query("SELECT COUNT(*) AS active_users FROM users WHERE active_status = 'Active'");
        const [[{ total_revenue }]] = await pool.query("SELECT SUM(amount) AS total_revenue FROM payments WHERE status = 'success'");

        res.json({
            total_courses,
            total_registrations,
            active_users,
            total_revenue: total_revenue || 0
        });
    } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

authRouter.get("/monthly-revenue",verifyAdmin, async (req, res) => {
    try {
        const [revenueData] = await pool.query("SELECT MONTHNAME(created_at) AS month, SUM(amount) AS revenue FROM payments WHERE status = 'success' GROUP BY month ORDER BY MONTH(created_at)");
        res.json(revenueData);
    } catch (error) {
        console.error("Error fetching monthly revenue:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

authRouter.get("/courses-by-category",verifyAdmin, async (req, res) => {
    try {
        const [categoryData] = await pool.query("SELECT category, COUNT(*) AS course_count FROM courses GROUP BY category");
        res.json(categoryData);
    } catch (error) {
        console.error("Error fetching courses by category:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


authRouter.get("/user-status",verifyAdmin, async (req, res) => {
    try {
        const [users] = await pool.query("SELECT name, mail_id, phone_number, active_status, created_at, active_at FROM users");
        res.json(users);
    } catch (error) {
        console.error("Error fetching user status:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

authRouter.post("/approve-internship", verifyAdmin, async (req, res) => {
    const { applicant_email, applicant_name, id,status } = req.body;

    if (status=="complete"){
        return res.status(400).json({ message: "Already student is selected" });
    }

    if (!applicant_email || !applicant_name || !id) {
        return res.status(400).json({ message: "Applicant email, name, and ID are required" });
    }
    try {
        
        const [result] = await pool.query(
            "UPDATE internship_form SET status = 'complete', status_updated_at = NOW() WHERE id = ? AND name = ?",
            [id, applicant_name]
        );


        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Applicant not found or already updated" });
        }

        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: "skillcoders.info@gmail.com",
                pass: process.env.EMAIL_PASSWORD,
            },
        });

        const mailOptions = {
            from: "skillcoders.info@gmail.com",
            to: applicant_email,
            subject: "Internship Selection Confirmation",
            html: `
                <div style="text-align: center;">
                    <img src="https://res.cloudinary.com/danm2mfq5/image/upload/v1741872237/oldtkme4197big9bv2qh.png" alt="Company Logo" style="width: 150px;" />
                    <h2>Congratulations ${applicant_name}!</h2>
                    <p>You have been selected for the internship. Our team member will reach out to you soon.</p>
                </div>
            `,
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Error sending email:", error);
                return res.status(500).json({ message: "Error sending email" });
            }
            res.json({ message: "Internship status updated and email sent successfully" });
        });
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});





authRouter.get("/user/me", verifyAdmin, async (req, res) => {
    try {
      const userId = req.user.id;
  
      const [rows] = await pool.query("SELECT admin FROM users WHERE id = ?", [userId]);
  
      if (rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
  
      res.json({ admin: rows[0].admin });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  

module.exports = authRouter;
