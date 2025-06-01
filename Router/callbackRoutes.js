const express = require("express");
const nodemailer = require("nodemailer");
const pool = require("../DbConnection/db");
const { verifyAdmin } = require("../middleware/authMiddle");

const callbacksRouter = express.Router();

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "skillcoders.info@gmail.com",
        pass: process.env.EMAIL_PASSWORD,
    },
});

callbacksRouter.get("/get/callbacks", verifyAdmin, async (req, res) => {
    try {
        const { rows: callbacks } = await pool.query("SELECT * FROM request_callback ORDER BY created_at DESC");
        res.json({ message: "Callbacks retrieved successfully", data: callbacks });
    } catch (error) {
        console.error("Error fetching callbacks:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

callbacksRouter.post("/callbacks", async (req, res) => {
    const { firstName, lastName, phoneNumber, mailId, comment } = req.body;

    try {
        const { rows: [result] } = await pool.query(
            `INSERT INTO request_callback (name, email, phone_number, message, status) 
             VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
            [firstName + ' ' + lastName, mailId, phoneNumber, comment]
        );

        res.json({ message: "Callback request added successfully", id: result.id });
    } catch (error) {
        console.error("Error adding callback request:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

callbacksRouter.patch("/callbacks/:id", verifyAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const { rows: existingCallback } = await pool.query(
            `SELECT name, email, phone_number, status 
             FROM request_callback WHERE id = $1`,
            [id]
        );

        if (existingCallback.length === 0) {
            return res.status(404).json({ message: "Callback request not found" });
        }

        const callback = existingCallback[0];

        if (callback.status === "Completed") {
            return res.status(400).json({
                message: "You have already connected with this user."
            });
        }

        await pool.query(
            `UPDATE request_callback SET status = 'Completed' WHERE id = $1`, 
            [id]
        );

        const mailOptions = {
            from: "bojjasathwik1234@gmail.com",
            to: callback.email,
            subject: "Thank You for Connecting with Us!",
            html: `
                <div style="text-align: center; font-family: Arial, sans-serif; color: #333;">
                    <img src="https://res.cloudinary.com/danm2mfq5/image/upload/v1741872237/oldtkme4197big9bv2qh.png" alt="Skillcoders Logo" style="width: 150px; margin-bottom: 20px;" />
                    <h2 style="color: #4A90E2;">Thank You, ${callback.name}!</h2>
                    <p style="font-size: 16px; line-height: 1.5;">
                        We sincerely appreciate you taking the time to reach out to us. Our support team at 
                        <strong>Skillcoders</strong> has successfully connected with you regarding your request, 
                        and we hope we were able to assist you with the information or support you needed.
                    </p>
                    <p style="font-size: 16px; line-height: 1.5;">
                        At <strong>Skillcoders</strong>, we are committed to providing the best service possible. 
                        If you have any further questions, need additional assistance, or would like to explore more about our offerings, 
                        please don't hesitate to reach out again. We're always happy to help!
                    </p>
                    <p style="font-size: 16px; font-weight: bold;">
                        Thank you for trusting us, and we look forward to serving you again in the future.
                    </p>
                    <p style="font-size: 14px; color: #777; margin-top: 20px;">
                        Best regards, <br>
                        <strong>Skillcoders</strong>
                    </p>
                </div>
            `,
        };
        
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Error sending email:", error);
                return res.status(500).json({ message: "Error sending email" });
            }
            res.json({ message: "Callback marked as completed and email sent successfully" });
        });
    } catch (error) {
        console.error("Error updating callback request:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

module.exports = callbacksRouter;
