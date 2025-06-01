const express = require("express");
const pool = require("../DbConnection/db");
const { verifyToken, verifyAdmin } = require("../middleware/authMiddle");

const internshipRouter = express.Router();

internshipRouter.post("/submit-internship", verifyToken, async (req, res) => {
    const { domain, name, phone_number, email, college, branch, year_of_passout } = req.body;
    const user_image = req.user.user_image;
    console.log(domain, name, phone_number, email, college, branch, year_of_passout)

    if (!name || !phone_number || !email || !college || !branch || !year_of_passout || !domain) {
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        const { rows: existingSubmission } = await pool.query(
            "SELECT * FROM internship_form WHERE email = $1",
            [email]
        );

        if (existingSubmission.length > 0) {
            return res.status(400).json({ message: "You already submitted one form!" });
        }

        const query = `
            INSERT INTO internship_form 
            (domain, name, phone_number, email, college, branch, year_of_passout, user_image)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
        `;
        const { rows: [result] } = await pool.query(query, [
            domain,
            name,
            phone_number,
            email,
            college,
            branch,
            year_of_passout,
            user_image
        ]);

        res.status(201).json({ 
            message: "Internship application submitted successfully",
            id: result.id
        });
    } catch (error) {
        console.error("Error submitting internship application:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

internshipRouter.get("/internship-forms", verifyAdmin, async (req, res) => {
    try {
        const query = `
            SELECT 
                id, domain, name, phone_number, email, college, 
                branch, year_of_passout, status, user_image, 
                status_updated_at, created_at
            FROM internship_form
            ORDER BY created_at DESC
        `;
        const { rows: results } = await pool.query(query);
        res.json(results);
    } catch (error) {
        console.error("Error fetching internship forms:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

module.exports = internshipRouter;