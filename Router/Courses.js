const express = require("express");
const pool = require("../DbConnection/db");
const jwt = require("jsonwebtoken");
const upload = require("../middleware/upload");
const cloudinary = require("../Cloud/cloudinary");
const fs = require("fs");
const {verifyAdmin,verifyToken}=require("../middleware/authMiddle");
const path = require("path");

const courseRouter = express.Router();

const deleteFile = (filePath) => {
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
};

courseRouter.post(
    "/add-course",
    verifyAdmin,
    upload.fields([{ name: "course_image", maxCount: 1 }, { name: "curriculum_pdf", maxCount: 1 }]),
    async (req, res) => {
        if (!req.files || (!req.files["course_image"] && !req.files["curriculum_pdf"])) {
            return res.status(400).json({ message: "File upload failed" });
        }

        const { title, price, instructor_name, description, category } = req.body;
        const user_id = req.user.id;

        console.log(title, price, instructor_name, description, category);

        if (!title || !price || !description || !category) {
            return res.status(400).json({ message: "Course title, price, description, and category are required" });
        }

        try {
            let courseImageUrl = null;
            let curriculumPdfUrl = null;

            if (req.files["course_image"]) {
                const imagePath = req.files["course_image"][0].path;
                if (!fs.existsSync(imagePath)) {
                    return res.status(400).json({ message: "Image file not found" });
                }

                const uploadRes = await cloudinary.uploader.upload(imagePath, { folder: "courses" });

                if (!uploadRes.secure_url) {
                    return res.status(500).json({ message: "Failed to upload image to Cloudinary" });
                }

                courseImageUrl = uploadRes.secure_url;
                fs.unlinkSync(imagePath);
            }

            if (req.files["curriculum_pdf"]) {
                const pdfFile = req.files["curriculum_pdf"][0];
                const pdfPath = pdfFile.path;
                const newFileName = pdfFile.filename;
                const localSavePath = path.join(__dirname, "../uploads", newFileName);

                if (!fs.existsSync(pdfPath)) {
                    return res.status(400).json({ message: "PDF file not found" });
                }

                fs.renameSync(pdfPath, localSavePath);
                curriculumPdfUrl = `/uploads/${newFileName}`;
            }

            const { rows: [result] } = await pool.query(
                `INSERT INTO courses 
                    (user_id, title, course_image, price, instructor_name, curriculum_pdf, description, category) 
                 VALUES 
                    ($1, $2, $3, $4, $5, $6, $7, $8) 
                 RETURNING id`,
                [user_id, title, courseImageUrl, price, instructor_name, curriculumPdfUrl, description, category]
            );

            res.status(201).json({
                message: "Course added successfully",
                courseId: result.id,
                curriculumPdfUrl,
            });
        } catch (error) {
            console.error("Error:", error);
            res.status(500).json({ message: "Internal server error" });
        }
    }
);

courseRouter.get("/course/:id", verifyAdmin, async (req, res) => {
    const courseId = req.params.id;

    try {
        const { rows: courses } = await pool.query(
            "SELECT * FROM courses WHERE id = $1",
            [courseId]
        );

        if (courses.length === 0) {
            return res.status(404).json({ message: "Course not found" });
        }

        res.json(courses[0]);
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

courseRouter.get("/courses", async (req, res) => {
    try {
        const { rows: courses } = await pool.query(
            "SELECT * FROM courses ORDER BY created_at DESC"
        );

        if (courses.length === 0) {
            return res.status(404).json({ message: "No courses available" });
        }

        res.json(courses);
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

courseRouter.delete("/course/:id", verifyAdmin, async (req, res) => {
    const courseId = req.params.id;

    try {
        const { rows: courses } = await pool.query(
            "SELECT * FROM courses WHERE id = $1",
            [courseId]
        );

        if (courses.length === 0) {
            return res.status(404).json({ message: "Course not found" });
        }

        await pool.query(
            "DELETE FROM courses WHERE id = $1",
            [courseId]
        );

        res.json({ message: "Course deleted successfully" });
    } catch (error) {
        console.error("Error deleting course:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

courseRouter.get("/registered-courses", verifyToken, async (req, res) => {
    const userId = req.user.id;

    try {
        const { rows: registeredCourses } = await pool.query(
            "SELECT c.* FROM courses c INNER JOIN registered_courses rc ON c.id = rc.course_id WHERE rc.user_id = $1",
            [userId]
        );

        res.json(registeredCourses);
    } catch (error) {
        console.error("Error fetching registered courses:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

courseRouter.get("/non-registered-courses", verifyToken, async (req, res) => {
    const userId = req.user.id;

    try {
        const { rows: nonRegisteredCourses } = await pool.query(
            `SELECT c.* 
             FROM courses c
             LEFT JOIN registered_courses rc ON c.id = rc.course_id AND rc.user_id = $1
             WHERE rc.user_id IS NULL`,
            [userId]
        );

        res.json(nonRegisteredCourses);
    } catch (error) {
        console.error("Error fetching non-registered courses:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

module.exports = courseRouter;